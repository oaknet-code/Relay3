const express = require("express");
const router = express.Router();
const stagingController = require("../controllers/staging.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

// Apply auth to all staging routes
router.use(protect);
router.use(authorize("admin", "warehouse_manager", "warehouse_operator", "site_engineer"));

// List all staging records
router.get("/", stagingController.listStaging);

// List kits awaiting staging
router.get("/awaiting", stagingController.listAwaitingStaging);

// Check in kit to staging bay
router.post(
  "/:kitId/checkin",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  stagingController.checkInKit
);

// Update QA results
router.patch(
  "/:stagingRecordId/qa",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  stagingController.updateQA
);

// Complete staging (mark as STAGED)
router.post(
  "/:stagingRecordId/complete",
  authorize("admin", "warehouse_manager", "warehouse_operator"),
  stagingController.completeStaging
);

module.exports = router;
