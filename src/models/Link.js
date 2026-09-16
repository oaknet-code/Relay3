const mongoose = require("mongoose");

const SiteSchema = new mongoose.Schema(
  {
    siteId: String,
    name: String,
    region: String,
    lat: Number,
    lng: Number,
    address: String,
  },
  { _id: false }
);

const LinkSchema = new mongoose.Schema(
  {
    linkId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: String,
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    clientName: { type: String, default: null },

    siteA: SiteSchema,
    siteB: SiteSchema,

    band: String,
    pathLengthKm: Number,
    dishSize: String,

    requiredHardware: [
      {
        type: String,
        model: String,
        qty: Number,
      },
    ],

    status: {
      type: String,
      enum: [
        "PLANNED",
        "KIT_ASSIGNED",
        "STAGING",
        "DISPATCHED",
        "IN_TRANSIT",
        "INSTALLING",
        "INSTALLED",
        "COMMISSIONED",
        "LIVE",
        "MAINTENANCE",
      ],
      default: "PLANNED",
    },

    networkConfig: {
      iduIp: String,
      oduIp: String,
      vlan: String,
    },
    rssiDbm: { type: Number, default: null },
    commissioning: {
      passed: { type: Boolean, default: false },
      at: Date,
      by: String,
    },
    health: {
      state: {
        type: String,
        enum: ["unknown", "ok", "degraded", "down"],
        default: "unknown",
      },
    },

    notes: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

LinkSchema.index({ linkId: 1 });
LinkSchema.index({ status: 1, deletedAt: 1 });
LinkSchema.index({ client: 1, deletedAt: 1 });

module.exports = mongoose.models.Link || mongoose.model("Link", LinkSchema);
