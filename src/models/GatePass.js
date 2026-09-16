const mongoose = require("mongoose");

const GatePassSchema = new mongoose.Schema(
  {
    gatePassNumber: { type: String, unique: true, required: true },
    dispatch: { type: mongoose.Schema.Types.ObjectId, ref: "Dispatch" },
    dispatchId: String,

    kit: { type: mongoose.Schema.Types.ObjectId, ref: "SiteKit" },
    kitId: String,
    link: { type: mongoose.Schema.Types.ObjectId, ref: "Link" },
    linkId: String,

    client: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    clientName: String,

    // Vehicle & driver info
    vehicle: {
      id: String,
      plate: String,
      make: String,
      type: String,
    },
    driver: {
      name: String,
      phone: String,
    },

    // Asset & consumable list
    assets: [
      {
        assetId: { type: mongoose.Schema.Types.ObjectId, ref: "Asset" },
        serial: String,
        type: String,
        model: String,
      },
    ],
    consumables: [
      {
        type: String,
        model: String,
        qty: Number,
        unit: String,
      },
    ],

    // Dispatch details
    warehouseLocation: String,
    destination: String,
    dispatchedAt: Date,
    dispatchedBy: String,

    // PDF storage
    pdfPath: String, // relative path under backend/uploads

    authorizedBy: String,
    authorizedAt: Date,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

GatePassSchema.index({ gatePassNumber: 1 });
GatePassSchema.index({ kit: 1, deletedAt: 1 });
GatePassSchema.index({ dispatch: 1, deletedAt: 1 });

module.exports =
  mongoose.models.GatePass || mongoose.model("GatePass", GatePassSchema);
