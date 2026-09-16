const mongoose = require("mongoose");

const AssetSchema = new mongoose.Schema(
  {
    assetType: {
      type: String,
      enum: ["IDU", "ODU", "DISH", "OTHER"],
      required: true,
    },
    manufacturer: String,
    model: { type: String, required: true, trim: true },
    serialNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    macAddress: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    band: { type: String, trim: true },
    purchaseDate: Date,
    purchaseOrderRef: String,
    purchaseCost: Number,
    condition: {
      type: String,
      enum: ["new", "good", "fair", "damaged", "faulty"],
      default: "new",
    },
    location: { type: String, required: true, trim: true },
    notes: String,

    status: {
      type: String,
      enum: [
        "STOCKED",
        "ALLOCATED",
        "STAGING",
        "QA_PASSED",
        "STAGED",
        "DISPATCHED",
        "IN_TRANSIT",
        "ARRIVED",
        "FIELD_INSTALLATION",
        "INSTALLED",
        "COMMISSIONED",
        "LIVE",
        "MAINTENANCE",
        "RETIRED",
      ],
      default: "STOCKED",
    },

    kit: { type: mongoose.Schema.Types.ObjectId, ref: "SiteKit", default: null },
    link: { type: mongoose.Schema.Types.ObjectId, ref: "Link", default: null },
    assignedComponentId: { type: mongoose.Schema.Types.ObjectId, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound indexes for allocation/filtering
AssetSchema.index({ assetType: 1, model: 1, status: 1 });
AssetSchema.index({ serialNumber: 1 });
AssetSchema.index({ status: 1, deletedAt: 1 });
AssetSchema.index({ link: 1, deletedAt: 1 });
AssetSchema.index({ kit: 1, deletedAt: 1 });

module.exports = mongoose.models.Asset || mongoose.model("Asset", AssetSchema);
