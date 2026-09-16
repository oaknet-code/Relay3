const Asset = require("../models/Asset");
const Consumable = require("../models/Consumable");
const { recordAudit } = require("../utils/audit");
const { assertTransition, InvalidTransitionError } = require("../services/stateMachine");

// ─────────────────────────────── ASSETS ────────────────────────────────

/**
 * GET /api/inventory/assets
 * List all assets (filters: type, status, band, link, kit, q for search)
 */
exports.listAssets = async (req, res) => {
  try {
    const { type, status, band, link, kit, q } = req.query;
    const filter = { deletedAt: null };

    if (type) filter.assetType = type;
    if (status) filter.status = status;
    if (band) filter.band = band;
    if (link) filter.link = link;
    if (kit) filter.kit = kit;
    if (q) {
      filter.$or = [
        { serialNumber: { $regex: q, $options: "i" } },
        { model: { $regex: q, $options: "i" } },
      ];
    }

    const assets = await Asset.find(filter)
      .populate("kit", "kitId name")
      .populate("link", "linkId name")
      .sort({ createdAt: -1 });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * GET /api/inventory/assets/:id
 * Get asset by ObjectId or serialNumber
 */
exports.getAsset = async (req, res) => {
  try {
    const { id } = req.params;
    let asset;

    // Try as ObjectId first, then as serialNumber
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      asset = await Asset.findById(id)
        .populate("kit", "kitId name")
        .populate("link", "linkId name");
    } else {
      asset = await Asset.findOne({ serialNumber: id.toUpperCase() })
        .populate("kit", "kitId name")
        .populate("link", "linkId name");
    }

    if (!asset || asset.deletedAt) {
      return res.status(404).json({ message: "Asset not found" });
    }
    res.json(asset);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * POST /api/inventory/assets
 * Create new asset; force status to STOCKED, reject duplicate serials
 */
exports.createAsset = async (req, res) => {
  try {
    const { serialNumber, assetType, model, macAddress, band, condition, location, purchaseDate } = req.body;

    if (!serialNumber || !assetType || !model) {
      return res
        .status(400)
        .json({ message: "serialNumber, assetType, model required" });
    }

    // Check for duplicate serial
    const existing = await Asset.findOne({
      serialNumber: serialNumber.toUpperCase(),
      deletedAt: null,
    });
    if (existing) {
      return res.status(409).json({ message: "Serial already registered" });
    }

    const asset = await Asset.create({
      serialNumber: serialNumber.toUpperCase(),
      assetType,
      model,
      macAddress: macAddress ? macAddress.toUpperCase() : undefined,
      band,
      condition,
      location,
      purchaseDate,
      status: "STOCKED",
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await recordAudit({
      entityType: "Asset",
      entityId: asset._id,
      action: "CREATE",
      user: req.user,
      notes: `Asset registered: ${asset.assetType} ${asset.model}`,
    });

    res.status(201).json(asset);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Serial already registered" });
    }
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * PUT /api/inventory/assets/:id
 * Update asset (condition, location, notes, band, purchase*); reject status in body
 */
exports.updateAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, kit, link, createdBy, updatedBy, deletedAt, ...bodyFields } = req.body;

    // Status changes go through /status endpoint, not PUT
    if (status !== undefined) {
      return res
        .status(400)
        .json({ message: "Use PATCH /assets/:id/status to change status" });
    }

    // Whitelist only editable fields; reject any attempt to set audit/system fields
    const allowedFields = {};
    const editableKeys = ["band", "condition", "location", "purchaseDate", "notes"];
    editableKeys.forEach(key => {
      if (bodyFields[key] !== undefined) {
        allowedFields[key] = bodyFields[key];
      }
    });

    let asset;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      asset = await Asset.findById(id);
    } else {
      asset = await Asset.findOne({ serialNumber: id.toUpperCase() });
    }

    if (!asset || asset.deletedAt) {
      return res.status(404).json({ message: "Asset not found" });
    }

    const before = { ...asset.toObject() };
    Object.assign(asset, allowedFields);
    asset.updatedBy = req.user._id;
    await asset.save();

    await recordAudit({
      entityType: "Asset",
      entityId: asset._id,
      action: "UPDATE",
      changes: { before, after: asset.toObject() },
      user: req.user,
    });

    res.json(asset);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * PATCH /api/inventory/assets/:id/status
 * Change asset status; validate against state machine
 */
exports.updateAssetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({ message: "status required" });
    }

    let asset;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      asset = await Asset.findById(id);
    } else {
      asset = await Asset.findOne({ serialNumber: id.toUpperCase() });
    }

    if (!asset || asset.deletedAt) {
      return res.status(404).json({ message: "Asset not found" });
    }

    // Validate state transition
    try {
      assertTransition("Asset", asset.status, status);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return res.status(err.status).json({ message: err.message });
      }
      throw err;
    }

    const fromStatus = asset.status;
    asset.status = status;
    asset.updatedBy = req.user._id;
    await asset.save();

    await recordAudit({
      entityType: "Asset",
      entityId: asset._id,
      action: "STATUS_CHANGE",
      fromStatus,
      toStatus: status,
      user: req.user,
      notes: reason || undefined,
    });

    res.json(asset);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * DELETE /api/inventory/assets/:id
 * Soft delete; only if status is STOCKED
 */
exports.deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;

    let asset;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      asset = await Asset.findById(id);
    } else {
      asset = await Asset.findOne({ serialNumber: id.toUpperCase() });
    }

    if (!asset || asset.deletedAt) {
      return res.status(404).json({ message: "Asset not found" });
    }

    if (asset.status !== "STOCKED") {
      return res
        .status(409)
        .json({ message: "Can only delete STOCKED assets" });
    }

    asset.deletedAt = new Date();
    asset.updatedBy = req.user._id;
    await asset.save();

    await recordAudit({
      entityType: "Asset",
      entityId: asset._id,
      action: "DELETE",
      user: req.user,
    });

    res.json({ message: "Asset deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * GET /api/inventory/assets/:id/audit
 * Get audit log for asset
 */
exports.getAssetAudit = async (req, res) => {
  try {
    const { id } = req.params;

    let assetId;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      assetId = id;
    } else {
      const asset = await Asset.findOne({ serialNumber: id.toUpperCase() });
      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }
      assetId = asset._id;
    }

    const AuditLog = require("../models/AuditLog");
    const logs = await AuditLog.find({ entityType: "Asset", entityId: assetId })
      .populate("performedBy", "firstName lastName")
      .sort({ createdAt: -1 });

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// ─────────────────────────── CONSUMABLES ──────────────────────────────

/**
 * GET /api/inventory/consumables
 * List all consumables
 */
exports.listConsumables = async (req, res) => {
  try {
    const consumables = await Consumable.find().sort({ createdAt: -1 });
    res.json(consumables);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * POST /api/inventory/consumables
 * Create new consumable; reject duplicate type/model
 */
exports.createConsumable = async (req, res) => {
  try {
    const { type, model, qtyOnHand, ...rest } = req.body;

    if (!type || !model || qtyOnHand === undefined) {
      return res
        .status(400)
        .json({ message: "type, model, qtyOnHand required" });
    }

    const existing = await Consumable.findOne({ type, model });
    if (existing) {
      return res.status(409).json({
        message: `Consumable ${type}/${model} already exists; use PATCH to restock`,
      });
    }

    const consumable = await Consumable.create({
      type,
      model,
      qtyOnHand: Number(qtyOnHand),
      createdBy: req.user._id,
      updatedBy: req.user._id,
      ...rest,
    });

    await recordAudit({
      entityType: "Consumable",
      entityId: consumable._id,
      action: "CREATE",
      user: req.user,
      notes: `Consumable created: ${type} ${model}`,
    });

    res.status(201).json(consumable);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Consumable type/model already exists",
      });
    }
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * PUT /api/inventory/consumables/:id
 * Update consumable (reorderThreshold, location, notes)
 */
exports.updateConsumable = async (req, res) => {
  try {
    const { id } = req.params;
    const { qtyOnHand, ...allowedFields } = req.body;

    const consumable = await Consumable.findById(id);
    if (!consumable) {
      return res.status(404).json({ message: "Consumable not found" });
    }

    Object.assign(consumable, allowedFields);
    consumable.updatedBy = req.user._id;
    await consumable.save();

    await recordAudit({
      entityType: "Consumable",
      entityId: consumable._id,
      action: "UPDATE",
      user: req.user,
    });

    res.json(consumable);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * PATCH /api/inventory/consumables/:id/stock
 * Adjust stock by delta (positive = add, negative = subtract)
 */
exports.restockConsumable = async (req, res) => {
  try {
    const { id } = req.params;
    const { delta } = req.body;

    if (delta === undefined || !Number.isFinite(delta)) {
      return res
        .status(400)
        .json({ message: "delta required (number, positive or negative)" });
    }

    const consumable = await Consumable.findById(id);
    if (!consumable) {
      return res.status(404).json({ message: "Consumable not found" });
    }

    const oldQty = consumable.qtyOnHand;
    consumable.qtyOnHand = Math.max(0, consumable.qtyOnHand + delta);
    consumable.updatedBy = req.user._id;
    await consumable.save();

    await recordAudit({
      entityType: "Consumable",
      entityId: consumable._id,
      action: "UPDATE",
      changes: { oldQty, newQty: consumable.qtyOnHand, delta },
      user: req.user,
    });

    res.json(consumable);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

module.exports = exports;
