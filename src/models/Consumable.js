const mongoose = require("mongoose");

const ConsumableSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    unit: { type: String, default: "ea", trim: true },
    qtyOnHand: { type: Number, required: true, min: 0 },
    reorderThreshold: { type: Number, default: 0 },
    location: String,
    notes: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Unique compound index: prevents duplicate entries for the same consumable type/model
ConsumableSchema.index({ type: 1, model: 1 }, { unique: true });

module.exports =
  mongoose.models.Consumable || mongoose.model("Consumable", ConsumableSchema);
