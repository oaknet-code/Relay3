const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    company: { type: String, default: null, trim: true },
    role: {
      type: String,
      enum: [
        "admin",
        "warehouse_manager",
        "warehouse_operator",
        "site_engineer",
        "client", // added: registerClient previously assigned "Client", which
                  // wasn't in this enum at all and would have failed validation
      ],
      // Least-privilege default. Previously defaulted to "admin", which
      // meant any user document created without an explicit role silently
      // got full admin rights.
      default: "site_engineer",
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
