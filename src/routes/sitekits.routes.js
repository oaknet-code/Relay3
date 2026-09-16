const express = require("express");
const multer = require("multer");
const router = express.Router();
const { list, getOne, create, update, delete: deleteKit, allocate, importExcel } = require("../controllers/sitekits.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");

// Memory storage — we parse the workbook straight from the buffer and
// never write it to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const okExt = /\.(xlsx|xls)$/i.test(file.originalname);
    const okMime = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ].includes(file.mimetype);
    if (!okExt || !okMime) {
      return cb(new Error("Only .xlsx or .xls files are accepted."));
    }
    cb(null, true);
  },
});

// Everything here requires a logged-in staff account. Previously none of
// these routes checked auth at all — anyone with network access to the
// server could read or overwrite kit inventory with no login.
router.use(protect, authorize("admin", "warehouse_manager", "warehouse_operator", "site_engineer"));

// GET /api/sitekits
router.get("/", list);

// POST /api/sitekits — Create kit
router.post("/", authorize("admin", "warehouse_manager"), create);

// POST /api/sitekits/import  (multipart/form-data, field "file")
// Only roles that actually manage stock can overwrite kit data.
router.post("/import", authorize("admin", "warehouse_manager"), upload.single("file"), importExcel);

// GET /api/sitekits/:kitId
router.get("/:kitId", getOne);

// PUT /api/sitekits/:kitId — Update kit
router.put("/:kitId", authorize("admin", "warehouse_manager"), update);

// DELETE /api/sitekits/:kitId — Delete kit
router.delete("/:kitId", authorize("admin"), deleteKit);

// POST /api/sitekits/:kitId/allocate — Allocate assets to kit
router.post("/:kitId/allocate", authorize("admin", "warehouse_manager", "warehouse_operator"), allocate);

module.exports = router;
