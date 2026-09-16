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

    // Create PDF
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="gatepass-${gatePass.gatePassNumber}.pdf"`);
    doc.pipe(res);

    // Title
    doc.fontSize(20).font("Helvetica-Bold").text("GATE PASS", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).font("Helvetica").text(gatePass.gatePassNumber, { align: "center" });
    doc.moveDown(1);

    // Header info
    doc.fontSize(11).font("Helvetica-Bold").text("DISPATCH DETAILS");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Kit ID: ${gatePass.kitId}`);
    doc.text(`Link ID: ${gatePass.linkId || "N/A"}`);
    doc.text(`Issued: ${new Date(gatePass.dispatchedAt).toLocaleString()}`);
    doc.text(`Dispatched By: ${gatePass.dispatchedBy}`);
    doc.moveDown(0.5);

    // Vehicle & Driver
    doc.fontSize(11).font("Helvetica-Bold").text("VEHICLE & DRIVER");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Vehicle: ${gatePass.vehicle?.plate || "N/A"} (${gatePass.vehicle?.make})`);
    doc.text(`Driver: ${gatePass.driver?.name || "N/A"} · ${gatePass.driver?.phone || ""}`);
    doc.moveDown(0.5);

    // Assets
    if (gatePass.assets && gatePass.assets.length > 0) {
      doc.fontSize(11).font("Helvetica-Bold").text("ASSETS");
      doc.fontSize(9).font("Helvetica");
      gatePass.assets.forEach((asset) => {
        doc.text(`• ${asset.serial} (${asset.type} · ${asset.model})`);
      });
      doc.moveDown(0.5);
    }

    // Consumables
    if (gatePass.consumables && gatePass.consumables.length > 0) {
      doc.fontSize(11).font("Helvetica-Bold").text("CONSUMABLES");
      doc.fontSize(9).font("Helvetica");
      gatePass.consumables.forEach((consumable) => {
        doc.text(`• ${consumable.qty} ${consumable.unit} · ${consumable.type} (${consumable.model})`);
      });
      doc.moveDown(0.5);
    }

    // Destination
    doc.fontSize(11).font("Helvetica-Bold").text("DESTINATION");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Warehouse: ${gatePass.warehouseLocation}`);
    doc.text(`Destination: ${gatePass.destination}`);
    doc.moveDown(1);

    // Footer
    doc.fontSize(9).font("Helvetica").text("Authorized by warehouse manager on dispatch. Keep this document with shipment.", {
      align: "center",
      color: "#666",
    });

    doc.end();
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

module.exports = exports;
