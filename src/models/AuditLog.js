const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "STATUS_CHANGE", "ALLOCATE", "DELETE"],
      required: true,
    },
    fromStatus: String,
    toStatus: String,
    changes: mongoose.Schema.Types.Mixed,

    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    performedByName: String,
    notes: String,
  },
  { timestamps: true }
);

// Compound index for fast audit retrieval per entity
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
