const mongoose = require("mongoose");

const StagingRecordSchema = new mongoose.Schema(
  {
    kit: { type: mongoose.Schema.Types.ObjectId, ref: "SiteKit", required: true },
    kitId: String,
    link: { type: mongoose.Schema.Types.ObjectId, ref: "Link" },
    status: {
      type: String,
      enum: ["CHECKED_IN", "IN_QA", "QA_PASSED", "QA_FAILED", "STAGED"],
      default: "CHECKED_IN",
    },

    // Staging technician / user info
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    checkedInAt: Date,
    stagedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    stagedAt: Date,

    // QA checklist results — one entry per asset in kit
    qaResults: [
      {
        assetId: { type: mongoose.Schema.Types.ObjectId, ref: "Asset" },
        assetSerial: String,
        assetType: String,
        tests: [
          {
            name: String, // e.g. "Firmware Version", "Frequency Check", "RSSI Baseline"
            pass: Boolean,
            value: String,
            notes: String,
          },
        ],
      },
    ],

    // Configuration recorded during staging
    configurationRecorded: {
      iduIp: String,
      oduIp: String,
      frequency: String,
      vlan: String,
      rssiBaseline: Number,
      notes: String,
    },

    // Overall staging notes
    notes: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

StagingRecordSchema.index({ kit: 1, deletedAt: 1 });
StagingRecordSchema.index({ kitId: 1, deletedAt: 1 });
StagingRecordSchema.index({ status: 1, deletedAt: 1 });

module.exports =
  mongoose.models.StagingRecord ||
  mongoose.model("StagingRecord", StagingRecordSchema);
