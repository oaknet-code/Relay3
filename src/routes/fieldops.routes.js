const express = require("express");
const router = express.Router();
const { sync, getByJob } = require("../controllers/fieldops.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

// Previously wide open — anyone could post fake field reports or read
// them with no login at all.
router.use(protect, authorize("admin", "warehouse_manager", "warehouse_operator", "site_engineer"));

// POST /api/fieldops/sync
router.post("/sync", sync);

// GET /api/fieldops/:jobId
router.get("/:jobId", getByJob);

module.exports = router;
