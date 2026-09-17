const mongoose = require("mongoose");

// One line item inside a kit, e.g. "IDU · Ceragon IP-50E · 2 required / 2 available"
const ComponentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true }, // IDU | ODU | DISH | Consumable
    model: { type: String, required: true, trim: true },
    unit: { type: String, default: "ea", trim: true }, // ea, m, roll, pack...
    qtyRequired: { type: Number, required: true, min: 0 },
    qtyAvailable: { type: Number, required: true, min: 0 },

    // Phase 1: track source of inventory (consumable vs. individual serialized assets)
    sourceType: {
      type: String,
      enum: ["consumable", "serialized"],
      default: "consumable",
    },
    consumable: { type: mongoose.Schema.Types.ObjectId, ref: "Consumable", default: null },
    assets: { type: [mongoose.Schema.Types.ObjectId], ref: "Asset", default: [] },
  },
  { _id: true }
);

const SiteKitSchema = new mongoose.Schema(
  {
    kitId: { type: String, required: true, unique: true, uppercase: true, trim: true }, // KIT-MW01
    name: { type: String, required: true, trim: true },
    band: { type: String, required: true, trim: true },
    link: { type: mongoose.Schema.Types.ObjectId, ref: "Link", default: null },
    status: {
      type: String,
      enum: ["DRAFT", "READY_FOR_STAGING", "STAGING", "STAGED", "DISPATCHED", "INSTALLED"],
      default: "DRAFT",
    },
    components: { type: [ComponentSchema], default: [] },
    // Set when the whole kit has been sent out via a dispatch; recomputeStatus()
    // leaves status alone once this is true so it doesn't flip back to
    // READY_FOR_STAGING just because stock elsewhere changed.
    dispatchedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Recomputes `status`. Call after creating/editing a kit or after any
// import, allocation, or dispatch. Does not run if the kit has already
// been fully dispatched.
SiteKitSchema.methods.recomputeStatus = function recomputeStatus() {
  if (this.dispatchedAt) {
    this.status = "DISPATCHED";
    return this.status;
  }
  // Don't clobber phase-2+ states that are managed by other workflows
  if (["STAGING", "STAGED", "INSTALLED"].includes(this.status)) {
    return this.status;
  }
  // A kit is ready for staging as soon as it has components defined —
  // staging no longer waits on qtyAvailable meeting qtyRequired first.
  this.status = this.components.length ? "READY_FOR_STAGING" : "DRAFT";
  return this.status;
};

module.exports = mongoose.models.SiteKit || mongoose.model("SiteKit", SiteKitSchema);
