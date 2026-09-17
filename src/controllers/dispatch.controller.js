const SiteKit = require("../models/SiteKit");
const Dispatch = require("../models/Dispatch");
const Asset = require("../models/Asset");
const Consumable = require("../models/Consumable");
const GatePass = require("../models/GatePass");
const Link = require("../models/Link");
const { recordAudit } = require("../utils/audit");
const { assertTransition, InvalidTransitionError } = require("../services/stateMachine");
const PDFDocument = require("pdfkit");

const genWaybillId = () => "GP-" + Math.floor(2000 + Math.random() * 8000);

// POST /api/dispatch
// body: {
//   kitId: "KIT-MW02",
//   linkId: "MW-02",
//   items: [{ componentId, qty }],   // componentId = SiteKit.components[i]._id
//   vehicle: { id, plate, make, type },
//   driver: { name, phone },
//   dispatchedBy: "D. Mwangi"
// }
//
// This is the one place inventory actually leaves a kit: every dispatch
// subtracts the requested qty from that component's qtyAvailable. If any
// line doesn't have enough stock, the whole dispatch is rejected (409)
// and nothing is decremented.
exports.createDispatch = async (req, res) => {
  try {
    const { kitId, linkId, items, vehicle, driver } = req.body;

    if (!kitId) return res.status(400).json({ message: "kitId is required" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const kit = await SiteKit.findOne({ kitId: kitId.toUpperCase() });
    if (!kit) return res.status(404).json({ message: `Kit ${kitId} not found` });

    // Validate every line has enough stock BEFORE mutating anything.
    const shortfalls = [];
    const resolved = items.map((line) => {
      const comp = kit.components.id(line.componentId);
      if (!comp) {
        shortfalls.push(`Component ${line.componentId} not found in kit ${kit.kitId}`);
        return null;
      }
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        shortfalls.push(`Invalid qty for ${comp.type} · ${comp.model}`);
        return null;
      }
      if (comp.qtyAvailable < qty) {
        shortfalls.push(
          `${comp.type} · ${comp.model}: requested ${qty}, only ${comp.qtyAvailable} available`
        );
        return null;
      }
      return { comp, qty };
    });

    if (shortfalls.length) {
      return res.status(409).json({ message: "Insufficient stock", details: shortfalls });
    }

    // All good — apply the decrements.
    const dispatchItems = resolved.map(({ comp, qty }) => {
      comp.qtyAvailable -= qty;
      return { componentId: comp._id, type: comp.type, model: comp.model, qty };
    });

    kit.recomputeStatus();
    // If this dispatch drained every component to zero, treat the kit as
    // fully sent out so recomputeStatus stops flipping it back to
    // READY_FOR_STAGING on its own.
    const fullyDrained = kit.components.every((c) => c.qtyAvailable === 0);
    if (fullyDrained) {
      kit.dispatchedAt = new Date();
      kit.status = "DISPATCHED";
    }
    await kit.save();

    const dispatch = await Dispatch.create({
      waybillId: genWaybillId(),
      kit: kit._id,
      kitId: kit.kitId,
      linkId: linkId || null,
      items: dispatchItems,
      vehicle: vehicle || {},
      driver: driver || {},
      // Derived from the verified JWT, not the request body — a client
      // can't claim to be a different user than the one they logged in as.
      dispatchedBy: `${req.user.firstName} ${req.user.lastName}`.trim(),
      dispatchedAt: new Date(),
    });

    // Create Gate Pass for the dispatch
    try {
      const link = await Link.findById(kit.link);
      const assets = await Asset.find({
        kit: kit._id,
        status: "STAGED",
        deletedAt: null,
      });

      const consumablesList = [];
      for (const comp of kit.components) {
        if (comp.sourceType === "consumable") {
          consumablesList.push({
            type: comp.type,
            model: comp.model,
            qty: comp.qtyRequired,
            unit: comp.unit,
          });
        }
      }

      const gatePass = await GatePass.create({
        gatePassNumber: dispatch.waybillId,
        dispatch: dispatch._id,
        dispatchId: dispatch.waybillId,
        kit: kit._id,
        kitId: kit.kitId,
        link: kit.link,
        linkId: link?.linkId,
        clientName: link?.clientName,
        vehicle,
        driver,
        assets: assets.map((a) => ({
          assetId: a._id,
          serial: a.serialNumber,
          type: a.assetType,
          model: a.model,
        })),
        consumables: consumablesList,
        warehouseLocation: "Main Warehouse",
        destination: link?.siteA?.name || "Site",
        dispatchedAt: new Date(),
        dispatchedBy: dispatch.dispatchedBy,
        createdBy: req.user._id,
      });

      // Record audit
      await recordAudit({
        entityType: "SiteKit",
        entityId: kit._id,
        action: "STATUS_CHANGE",
        fromStatus: "STAGED",
        toStatus: "DISPATCHED",
        user: req.user,
        notes: `Dispatched with gate pass ${gatePass.gatePassNumber}`,
      });
    } catch (gpErr) {
      console.error("Gate Pass creation failed:", gpErr);
      // Don't fail the dispatch if gate pass fails
    }

    res.status(201).json({ dispatch, kit });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// GET /api/dispatch/:id
exports.getOne = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });
    res.json(dispatch);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// GET /api/dispatch?kitId=&linkId=
exports.list = async (req, res) => {
  try {
    const filter = {};
    if (req.query.kitId) filter.kitId = req.query.kitId.toUpperCase();
    if (req.query.linkId) filter.linkId = req.query.linkId;
    const dispatches = await Dispatch.find(filter).sort({ dispatchedAt: -1 });
    res.json(dispatches);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// GET /api/dispatch/:id/gatepass
// Fetch gate pass for a dispatch
exports.getGatePass = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) {
      return res.status(404).json({ message: "Dispatch not found" });
    }

    const gatePass = await GatePass.findOne({
      dispatch: dispatch._id,
      deletedAt: null,
    });

    if (!gatePass) {
      return res.status(404).json({ message: "Gate pass not found for this dispatch" });
    }

    res.json(gatePass);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// GET /api/dispatch/:id/gatepass/pdf
// Download gate pass as PDF
exports.getGatePassPDF = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) {
      return res.status(404).json({ message: "Dispatch not found" });
    }

    const gatePass = await GatePass.findOne({
      dispatch: dispatch._id,
      deletedAt: null,
    });

    if (!gatePass) {
      return res.status(404).json({ message: "Gate pass not found for this dispatch" });
    }

    // Create PDF — laid out as a waybill/gate pass: label/value fields,
    // an items table (assets + consumables together), then a chain-of-
    // custody signature block.
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="gatepass-${gatePass.gatePassNumber}.pdf"`);
    doc.pipe(res);

    const GRAY = "#666666";
    const LINE = "#cccccc";
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    const hr = () => {
      doc.moveDown(0.4);
      doc.strokeColor(LINE).moveTo(left, doc.y).lineTo(right, doc.y).stroke();
      doc.moveDown(0.6);
    };

    const field = (label, value) => {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#000").text(label.toUpperCase());
      doc.fontSize(10.5).font("Helvetica").fillColor("#000").text(value || "—");
      doc.moveDown(0.5);
    };

    // Title
    doc.fontSize(20).font("Helvetica-Bold").fillColor("#000").text("Waybill / Gate Pass");
    doc.fontSize(11).font("Helvetica").fillColor(GRAY).text(gatePass.gatePassNumber);
    doc.fillColor("#000");
    hr();

    field("Kit", gatePass.kitId);
    field("Link", gatePass.linkId);
    field("Destination", gatePass.destination);
    field("Departure", gatePass.warehouseLocation);
    field(
      "Vehicle",
      gatePass.vehicle?.plate
        ? `${gatePass.vehicle.plate} · ${gatePass.vehicle.make || ""}${gatePass.vehicle.type ? ` (${gatePass.vehicle.type})` : ""}`
        : null
    );
    field(
      "Driver",
      gatePass.driver?.name
        ? `${gatePass.driver.name}${gatePass.driver.phone ? ` · ${gatePass.driver.phone}` : ""}`
        : null
    );
    field("Field Team", null);

    // Items table
    doc.fontSize(11).font("Helvetica-Bold").text("Items");
    doc.moveDown(0.4);

    const colItem = left;
    const colSerial = left + 260;
    const colQty = right - 40;

    const tableHeadY = doc.y;
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(GRAY);
    doc.text("ITEM", colItem, tableHeadY);
    doc.text("SERIAL / ASSET ID", colSerial, tableHeadY);
    doc.text("QTY", colQty, tableHeadY);
    doc.fillColor("#000");
    doc.moveDown(0.7);
    hr();

    doc.fontSize(9.5).font("Helvetica");
    (gatePass.consumables || []).forEach((c) => {
      const y = doc.y;
      doc.text(`Consumable · ${c.model}`, colItem, y, { width: colSerial - colItem - 10 });
      doc.text("—", colSerial, y);
      doc.text(String(c.qty), colQty, y);
      doc.moveDown(0.5);
    });
    (gatePass.assets || []).forEach((a) => {
      const y = doc.y;
      doc.text(`${a.type} · ${a.model}`, colItem, y, { width: colSerial - colItem - 10 });
      doc.text(a.serial || "—", colSerial, y);
      doc.text("1", colQty, y);
      doc.moveDown(0.5);
    });

    doc.x = left; // explicit column x's above leave the cursor pinned at colQty
    hr();

    // Chain of custody
    doc.fontSize(11).font("Helvetica-Bold").text("Chain of Custody");
    doc.moveDown(0.8);
    doc.fontSize(10).font("Helvetica");
    doc.text("Warehouse Staff Signature: ______________________________");
    doc.moveDown(0.8);
    doc.text("Driver Signature: ______________________________");
    doc.moveDown(0.8);
    doc.text("Field Team Signature (on receipt): ______________________________");
    doc.moveDown(1.2);

    doc.fontSize(8).font("Helvetica").fillColor(GRAY).text(
      `Generated ${new Date().toLocaleString()} — dispatched by ${gatePass.dispatchedBy} on ${new Date(gatePass.dispatchedAt).toLocaleString()}.`
    );

    doc.end();
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

module.exports = exports;
