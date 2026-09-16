const SiteKit = require("../models/SiteKit");
const Link = require("../models/Link");
const Asset = require("../models/Asset");
const Consumable = require("../models/Consumable");
const { parseSiteKitsExcel } = require("../utils/parseSiteKitsExcel");
const { recordAudit } = require("../utils/audit");
const { assertTransition, InvalidTransitionError } = require("../services/stateMachine");

// GET /api/sitekits
exports.list = async (req, res) => {
  try {
    const kits = await SiteKit.find({ deletedAt: null })
      .populate("link", "linkId name")
      .sort({ kitId: 1 });
    res.json(kits);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// GET /api/sitekits/:kitId
exports.getOne = async (req, res) => {
  try {
    const kit = await SiteKit.findOne({
      kitId: req.params.kitId.toUpperCase(),
      deletedAt: null,
    })
      .populate("link", "linkId name")
      .populate("components.consumable");
    if (!kit) return res.status(404).json({ message: "Kit not found" });
    res.json(kit);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// POST /api/sitekits
// Create new site kit
exports.create = async (req, res) => {
  try {
    const { kitId, name, band, linkId, components } = req.body;

    if (!kitId || !name || !band || !linkId) {
      return res
        .status(400)
        .json({ message: "kitId, name, band, linkId required" });
    }

    if (!Array.isArray(components)) {
      return res.status(400).json({ message: "components must be array" });
    }

    // Verify link exists and get its current status
    const link = await Link.findById(linkId);
    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }

    if (link.deletedAt) {
      return res.status(404).json({ message: "Link not found" });
    }

    // Check if link already has a kit
    const existingKit = await SiteKit.findOne({ link: linkId, deletedAt: null });
    if (existingKit) {
      return res.status(409).json({
        message: `Link already has kit ${existingKit.kitId}`,
      });
    }

    // Check for duplicate kit ID
    const duplicateKit = await SiteKit.findOne({
      kitId: kitId.toUpperCase(),
      deletedAt: null,
    });
    if (duplicateKit) {
      return res.status(409).json({ message: "Kit ID already exists" });
    }

    // Create kit with DRAFT status
    const kit = await SiteKit.create({
      kitId: kitId.toUpperCase(),
      name,
      band,
      link: linkId,
      components: components.map((c) => ({
        type: c.type,
        model: c.model,
        unit: c.unit || "ea",
        qtyRequired: c.qtyRequired,
        qtyAvailable: 0,
        sourceType: c.sourceType || "consumable",
        consumable: c.consumableId || null,
        assets: [],
      })),
      status: "DRAFT",
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    // Transition link from PLANNED to KIT_ASSIGNED
    try {
      assertTransition("Link", link.status, "KIT_ASSIGNED");
      link.status = "KIT_ASSIGNED";
      link.updatedBy = req.user._id;
      await link.save();

      await recordAudit({
        entityType: "Link",
        entityId: link._id,
        action: "STATUS_CHANGE",
        fromStatus: "PLANNED",
        toStatus: "KIT_ASSIGNED",
        user: req.user,
        notes: `Kit ${kit.kitId} assigned`,
      });
    } catch (err) {
      // If link transition fails, clean up the kit
      kit.deletedAt = new Date();
      await kit.save();

      if (err instanceof InvalidTransitionError) {
        return res.status(err.status).json({ message: err.message });
      }
      throw err;
    }

    await recordAudit({
      entityType: "SiteKit",
      entityId: kit._id,
      action: "CREATE",
      user: req.user,
      notes: `Kit created: ${kit.kitId}`,
    });

    await kit.populate("link", "linkId name");
    res.status(201).json(kit);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Kit ID already exists" });
    }
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// PUT /api/sitekits/:kitId
// Update kit (only while DRAFT)
exports.update = async (req, res) => {
  try {
    const { kitId } = req.params;
    const { status, link, createdBy, updatedBy, deletedAt, ...bodyFields } = req.body;

    // Whitelist only editable fields; reject attempts to set audit/system fields
    const allowedFields = {};
    const editableKeys = ["name", "band", "components"];
    editableKeys.forEach(key => {
      if (bodyFields[key] !== undefined) {
        allowedFields[key] = bodyFields[key];
      }
    });

    const kit = await SiteKit.findOne({
      kitId: kitId.toUpperCase(),
      deletedAt: null,
    });
    if (!kit) {
      return res.status(404).json({ message: "Kit not found" });
    }

    if (kit.status !== "DRAFT") {
      return res
        .status(409)
        .json({ message: "Can only edit DRAFT kits" });
    }

    Object.assign(kit, allowedFields);
    kit.updatedBy = req.user._id;
    await kit.save();

    await recordAudit({
      entityType: "SiteKit",
      entityId: kit._id,
      action: "UPDATE",
      user: req.user,
    });

    await kit.populate("link", "linkId name");
    res.json(kit);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// DELETE /api/sitekits/:kitId
// Soft delete kit (only while DRAFT)
exports.delete = async (req, res) => {
  try {
    const { kitId } = req.params;

    const kit = await SiteKit.findOne({
      kitId: kitId.toUpperCase(),
      deletedAt: null,
    });
    if (!kit) {
      return res.status(404).json({ message: "Kit not found" });
    }

    if (kit.status !== "DRAFT") {
      return res
        .status(409)
        .json({ message: "Can only delete DRAFT kits" });
    }

    kit.deletedAt = new Date();
    kit.updatedBy = req.user._id;
    await kit.save();

    await recordAudit({
      entityType: "SiteKit",
      entityId: kit._id,
      action: "DELETE",
      user: req.user,
    });

    res.json({ message: "Kit deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// POST /api/sitekits/:kitId/allocate
// Allocate assets and consumables to kit components
exports.allocate = async (req, res) => {
  try {
    const { kitId } = req.params;

    const kit = await SiteKit.findOne({
      kitId: kitId.toUpperCase(),
      deletedAt: null,
    }).populate("link");

    if (!kit) {
      return res.status(404).json({ message: "Kit not found" });
    }

    if (!kit.components || kit.components.length === 0) {
      return res
        .status(409)
        .json({ message: "Kit has no components to allocate" });
    }

    const changes = [];

    // Allocate each component
    for (const component of kit.components) {
      if (component.sourceType === "serialized") {
        // Find available serialized assets
        const neededQty = component.qtyRequired - (component.assets?.length || 0);
        if (neededQty > 0) {
          const availableAssets = await Asset.find({
            assetType: component.type,
            model: component.model,
            status: "STOCKED",
            deletedAt: null,
          }).limit(neededQty);

          if (availableAssets.length === 0) {
            return res.status(409).json({
              message: `No available ${component.type} ${component.model} assets for component`,
            });
          }

          for (const asset of availableAssets) {
            // Validate and transition asset to ALLOCATED
            try {
              assertTransition("Asset", asset.status, "ALLOCATED");
            } catch (err) {
              if (err instanceof InvalidTransitionError) {
                return res.status(err.status).json({ message: err.message });
              }
              throw err;
            }

            asset.status = "ALLOCATED";
            asset.kit = kit._id;
            asset.link = kit.link?._id || null;
            asset.assignedComponentId = component._id;
            asset.updatedBy = req.user._id;
            await asset.save();

            component.assets.push(asset._id);

            changes.push({
              asset: asset.serialNumber,
              action: "ALLOCATED",
            });
          }
        }

        component.qtyAvailable = component.assets.length;
      } else if (component.sourceType === "consumable") {
        // Find and reserve consumable stock
        const consumable = await Consumable.findById(component.consumable);
        if (!consumable) {
          return res.status(404).json({
            message: `Consumable not found for ${component.type} ${component.model}`,
          });
        }

        if (consumable.qtyOnHand >= component.qtyRequired) {
          // Reserve the quantity
          consumable.qtyOnHand -= component.qtyRequired;
          consumable.updatedBy = req.user._id;
          await consumable.save();
          component.qtyAvailable = component.qtyRequired;

          changes.push({
            consumable: `${component.type}/${component.model}`,
            action: "RESERVED",
            qty: component.qtyRequired,
          });
        } else {
          // Partial allocation
          component.qtyAvailable = consumable.qtyOnHand;

          changes.push({
            consumable: `${component.type}/${component.model}`,
            action: "PARTIAL",
            requested: component.qtyRequired,
            available: consumable.qtyOnHand,
          });
        }
      }
    }

    // Recompute kit status
    kit.recomputeStatus();
    kit.updatedBy = req.user._id;
    await kit.save();

    await recordAudit({
      entityType: "SiteKit",
      entityId: kit._id,
      action: "ALLOCATE",
      changes,
      user: req.user,
      notes: `Allocated ${changes.length} item(s)`,
    });

    await kit.populate("link", "linkId name");
    res.json(kit);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// POST /api/sitekits/import  (multipart/form-data, field name "file")
// Upserts kits by kit_id. Existing kits have their components fully
// replaced by what's in the sheet (this is a re-sync, not a merge) —
// re-upload the whole sheet each time, not just changed rows.
exports.importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded. Attach it as 'file'." });
    }

    let kitDocs;
    try {
      kitDocs = parseSiteKitsExcel(req.file.buffer);
    } catch (parseErr) {
      return res.status(400).json({ message: parseErr.message });
    }

    const results = [];
    for (const doc of kitDocs) {
      let kit = await SiteKit.findOne({ kitId: doc.kitId, deletedAt: null });
      if (kit) {
        kit.name = doc.name;
        kit.band = doc.band;
        kit.sites = doc.sites;
        kit.components = doc.components;
      } else {
        kit = new SiteKit(doc);
        kit.createdBy = req.user._id;
      }
      kit.updatedBy = req.user._id;
      kit.recomputeStatus();
      await kit.save();
      results.push({ kitId: kit.kitId, status: kit.status, components: kit.components.length });
    }

    res.json({
      message: `Imported ${results.length} kit(s) from the sheet.`,
      kits: results,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};
