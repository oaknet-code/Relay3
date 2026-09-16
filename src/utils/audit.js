const AuditLog = require("../models/AuditLog");

/**
 * Record an audit log entry
 * Called explicitly from controllers to capture context (performedBy = req.user)
 * Never blocks business logic — errors are logged but not thrown
 * @param {Object} params
 * @param {string} params.entityType - "Asset", "SiteKit", "Link"
 * @param {string} params.entityId - MongoDB ObjectId
 * @param {string} params.action - "CREATE", "UPDATE", "STATUS_CHANGE", "ALLOCATE", "DELETE"
 * @param {string} [params.fromStatus] - Previous status (for STATUS_CHANGE)
 * @param {string} [params.toStatus] - New status (for STATUS_CHANGE)
 * @param {*} [params.changes] - Diff/details (for UPDATE)
 * @param {Object} [params.user] - req.user object
 * @param {string} [params.notes] - Additional context
 */
async function recordAudit({
  entityType,
  entityId,
  action,
  fromStatus,
  toStatus,
  changes,
  user,
  notes,
}) {
  try {
    await AuditLog.create({
      entityType,
      entityId,
      action,
      fromStatus,
      toStatus,
      changes,
      performedBy: user?._id || null,
      performedByName: user ? `${user.firstName} ${user.lastName}`.trim() : "System",
      notes,
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
    // Never throw — business logic takes priority
  }
}

module.exports = { recordAudit };
