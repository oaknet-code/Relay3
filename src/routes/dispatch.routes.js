const express = require("express");
const router = express.Router();
const { createDispatch, getOne, list, getGatePass } = require("../controllers/dispatch.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

// Previously wide open — anyone could hit this and drain kit inventory
// with no login at all.
router.use(protect, authorize("admin", "warehouse_manager", "warehouse_operator"));

// GET /api/dispatch?kitId=&linkId=
router.get("/", list);

// POST /api/dispatch — only roles that actually handle physical dispatch.
router.post("/", createDispatch);

// GET /api/dispatch/:id
router.get("/:id", getOne);

// GET /api/dispatch/:id/gatepass
router.get("/:id/gatepass", getGatePass);

module.exports = router;
