const express = require("express");
const router = express.Router();
const linksController = require("../controllers/links.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

// Apply auth to all link routes
router.use(protect);
router.use(
  authorize(
    "admin",
    "warehouse_manager",
    "warehouse_operator",
    "site_engineer",
    "client"
  )
);

// List links (clients see only their own)
router.get("/", linksController.listLinks);

// Get single link
router.get("/:linkId", linksController.getLink);

// Create link (admin/warehouse_manager only)
router.post(
  "/",
  authorize("admin", "warehouse_manager"),
  linksController.createLink
);

// Update link
router.put(
  "/:linkId",
  authorize("admin", "warehouse_manager"),
  linksController.updateLink
);

// Change link status
router.patch(
  "/:linkId/status",
  authorize("admin", "warehouse_manager"),
  linksController.updateLinkStatus
);

// Delete link (admin only)
router.delete(
  "/:linkId",
  authorize("admin"),
  linksController.deleteLink
);

module.exports = router;
