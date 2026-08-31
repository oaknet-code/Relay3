const mongoose = require("mongoose");

// One line item inside a kit, e.g. "IDU · Ceragon IP-50E · 2 required / 2 available"
const ComponentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true }, // IDU | ODU | DISH | Consumable
    model: { type: String, required: true, trim: true },
    unit: { type: String, default: "ea", trim: true }, // ea, m, roll, pack...
    qtyRequired: { type: Number, required: true, min: 0 },
    qtyAvailable: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const SiteKitSchema = new mongoose.Schema(
  {
    kitId: { type: String, required: true, unique: true, uppercase: true, trim: true }, // KIT-MW01
    name: { type: String, required: true, trim: true },
    band: { type: String, required: true, trim: true },
    sites: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["ready", "incomplete", "pending", "dispatched"],
      default: "pending",
    },
    components: { type: [ComponentSchema], default: [] },
    // Set when the whole kit has been sent out via a dispatch; recomputeStatus()
    // leaves status alone once this is true so it doesn't flip back to
    // ready/incomplete just because stock elsewhere changed.
    dispatchedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Recomputes `status` from the component quantities. Call after any
// import or dispatch that changes qtyAvailable. Does not run if the
// kit has already been fully dispatched.
SiteKitSchema.methods.recomputeStatus = function recomputeStatus() {
  if (this.dispatchedAt) {
    this.status = "dispatched";
    return this.status;
  }
  if (!this.components.length) {
    this.status = "pending";
    return this.status;
  }
  const allMet = this.components.every((c) => c.qtyAvailable >= c.qtyRequired);
  const anyZero = this.components.some((c) => c.qtyAvailable === 0);
  if (allMet) this.status = "ready";
  else if (anyZero) this.status = "pending";
  else this.status = "incomplete";
  return this.status;
};

module.exports = mongoose.models.SiteKit || mongoose.model("SiteKit", SiteKitSchema);
