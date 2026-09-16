const express = require("express");
const router = express.Router();
const inventoryController = require("../controllers/inventory.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

// Apply auth to all inventory routes
router.use(protect);
router.use(authorize("admin", "warehouse_manager", "warehouse_operator", "site_engineer"));

// ─────────── ASSETS ───────────

// List assets
router.get("/assets", inventoryController.listAssets);

// Get single asset
router.get("/assets/:id", inventoryController.getAsset);

// Create asset (admin/warehouse_manager/warehouse_operator only)
router.post(
  "/assets",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  inventoryController.createAsset
);

// Update asset fields
router.put(
  "/assets/:id",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  inventoryController.updateAsset
);

// Change asset status
router.patch(
  "/assets/:id/status",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  inventoryController.updateAssetStatus
);

// Delete asset (admin only)
router.delete("/assets/:id", authorize("admin"), inventoryController.deleteAsset);

// Get asset audit log
router.get("/assets/:id/audit", authorize("admin", "warehouse_manager"), inventoryController.getAssetAudit);

// ────────── CONSUMABLES ──────────

// List consumables
router.get("/consumables", inventoryController.listConsumables);

// Create consumable
router.post(
  "/consumables",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  inventoryController.createConsumable
);

// Update consumable
router.put(
  "/consumables/:id",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  inventoryController.updateConsumable
);

// Adjust consumable stock
router.patch(
  "/consumables/:id/stock",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  inventoryController.restockConsumable
);

module.exports = router;
