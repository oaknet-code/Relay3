const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  { type: String, model: String, serial: String },
  { _id: false }
);

const FieldOpsReportSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, index: true }, // e.g. MW-04

    // Generated on the handheld (uuid) at the moment the engineer hits
    // "Sync" — even offline. Lets a retried/queued sync upsert instead of
    // creating a duplicate report once connectivity returns.
    clientSyncId: { type: String, required: true, unique: true },

    receivedItems: { type: [ItemSchema], default: [] },
    missingItems: { type: [ItemSchema], default: [] },
    installedItems: { type: [ItemSchema], default: [] },

    signedBy: { type: String, default: "N/A" },
    gps: { type: String, default: "N/A" },

    // When the engineer actually captured this in the field (may be well
    // before syncedAt if they were offline for a while).
    clientTimestamp: { type: Date, required: true },
    // When it actually landed on the server.
    syncedAt: { type: Date, default: Date.now },

    submittedBy: { type: String, default: null }, // user id / name from auth
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.FieldOpsReport || mongoose.model("FieldOpsReport", FieldOpsReportSchema);
