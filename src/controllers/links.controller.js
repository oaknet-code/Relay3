const Link = require("../models/Link");
const { recordAudit } = require("../utils/audit");
const { assertTransition, InvalidTransitionError } = require("../services/stateMachine");

/**
 * GET /api/links
 * List links; clients auto-filtered to their own
 */
exports.listLinks = async (req, res) => {
  try {
    const filter = { deletedAt: null };

    // If user is client, only show their own links
    if (req.user.role === "client") {
      filter.client = req.user._id;
    }

    const links = await Link.find(filter)
      .populate("client", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.json(links);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * GET /api/links/:linkId
 * Get single link; 403 if client requests someone else's link
 */
exports.getLink = async (req, res) => {
  try {
    const { linkId } = req.params;

    const link = await Link.findOne({ linkId: linkId.toUpperCase(), deletedAt: null }).populate(
      "client",
      "firstName lastName email"
    );

    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }

    // Client role can only view their own links
    if (req.user.role === "client" && link.client && link.client._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You don't have permission to view this link" });
    }

    res.json(link);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * POST /api/links
 * Create new link; force status to PLANNED
 */
exports.createLink = async (req, res) => {
  try {
    const { linkId, name, client, siteA, siteB, band, ...rest } = req.body;

    if (!linkId) {
      return res.status(400).json({ message: "linkId required" });
    }

    // Check for duplicate
    const existing = await Link.findOne({ linkId: linkId.toUpperCase(), deletedAt: null });
    if (existing) {
      return res.status(409).json({ message: "Link already exists" });
    }

    const link = await Link.create({
      linkId: linkId.toUpperCase(),
      name,
      client: client || null,
      siteA: siteA || {},
      siteB: siteB || {},
      band,
      status: "PLANNED",
      createdBy: req.user._id,
      updatedBy: req.user._id,
      ...rest,
    });

    await recordAudit({
      entityType: "Link",
      entityId: link._id,
      action: "CREATE",
      user: req.user,
      notes: `Link created: ${link.linkId}`,
    });

    const populated = await link.populate("client", "firstName lastName email");
    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Link already exists" });
    }
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * PUT /api/links/:linkId
 * Update link (everything except status and kit ref)
 */
exports.updateLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { status, kit, ...allowedFields } = req.body;

    // Status changes go through /status endpoint
    if (status !== undefined) {
      return res
        .status(400)
        .json({ message: "Use PATCH /links/:linkId/status to change status" });
    }

    const link = await Link.findOne({ linkId: linkId.toUpperCase(), deletedAt: null });
    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }

    Object.assign(link, allowedFields);
    link.updatedBy = req.user._id;
    await link.save();

    await recordAudit({
      entityType: "Link",
      entityId: link._id,
      action: "UPDATE",
      user: req.user,
    });

    await link.populate("client", "firstName lastName email");
    res.json(link);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * PATCH /api/links/:linkId/status
 * Change link status; validate against state machine
 */
exports.updateLinkStatus = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "status required" });
    }

    const link = await Link.findOne({ linkId: linkId.toUpperCase(), deletedAt: null });
    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }

    // Validate state transition
    try {
      assertTransition("Link", link.status, status);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return res.status(err.status).json({ message: err.message });
      }
      throw err;
    }

    const fromStatus = link.status;
    link.status = status;
    link.updatedBy = req.user._id;
    await link.save();

    await recordAudit({
      entityType: "Link",
      entityId: link._id,
      action: "STATUS_CHANGE",
      fromStatus,
      toStatus: status,
      user: req.user,
    });

    await link.populate("client", "firstName lastName email");
    res.json(link);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * DELETE /api/links/:linkId
 * Soft delete; only if status is PLANNED and no kit references it
 */
exports.deleteLink = async (req, res) => {
  try {
    const { linkId } = req.params;

    const link = await Link.findOne({ linkId: linkId.toUpperCase(), deletedAt: null });
    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }

    if (link.status !== "PLANNED") {
      return res.status(409).json({ message: "Can only delete PLANNED links" });
    }

    // Check if any kit references this link
    const SiteKit = require("../models/SiteKit");
    const kitCount = await SiteKit.countDocuments({ link: link._id, deletedAt: null });
    if (kitCount > 0) {
      return res
        .status(409)
        .json({ message: "Cannot delete link with active kits" });
    }

    link.deletedAt = new Date();
    link.updatedBy = req.user._id;
    await link.save();

    await recordAudit({
      entityType: "Link",
      entityId: link._id,
      action: "DELETE",
      user: req.user,
    });

    res.json({ message: "Link deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

module.exports = exports;
