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
    // NOTE: a field literally named "type" collides with Mongoose's reserved
    // SchemaType key — `type: String` here would make Mongoose read the whole
    // object as "this path's type is String" and silently drop everything
    // else. Nesting it as `type: { type: String }` avoids that (see
    // Dispatch.js's VehicleSchema, which already does this correctly).
    vehicle: {
      id: String,
      plate: String,
      make: String,
      type: { type: String },
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
        type: { type: String },
        model: String,
      },
    ],
    consumables: [
      {
        type: { type: String },
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
