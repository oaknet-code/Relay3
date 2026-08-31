const mongoose = require("mongoose");

const DispatchItemSchema = new mongoose.Schema(
  {
    componentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, required: true },
    model: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const VehicleSchema = new mongoose.Schema(
  {
    id: { type: String },
    plate: { type: String },
    make: { type: String },
    type: { type: String }, // vehicle type e.g. Pickup, Van — safe here since it's wrapped in an explicit schema
  },
  { _id: false }
);

const DriverSchema = new mongoose.Schema(
  {
    name: { type: String },
    phone: { type: String },
  },
  { _id: false }
);

const DispatchSchema = new mongoose.Schema(
  {
    waybillId: { type: String, required: true, unique: true }, // e.g. GP-2312
    kit: { type: mongoose.Schema.Types.ObjectId, ref: "SiteKit", required: true },
    kitId: { type: String, required: true }, // denormalized for easy display/filtering
    linkId: { type: String, default: null }, // e.g. MW-02
    items: { type: [DispatchItemSchema], required: true },
    vehicle: { type: VehicleSchema, default: () => ({}) },
    driver: { type: DriverSchema, default: () => ({}) },
    dispatchedBy: { type: String, default: null }, // user id / name from auth
    dispatchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Dispatch || mongoose.model("Dispatch", DispatchSchema);
