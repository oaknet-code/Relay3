const SiteKit = require("../models/SiteKit");
const { parseSiteKitsExcel } = require("../utils/parseSiteKitsExcel");

// GET /api/sitekits
exports.list = async (req, res) => {
  try {
    const kits = await SiteKit.find().sort({ kitId: 1 });
    res.json(kits);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// GET /api/sitekits/:kitId
exports.getOne = async (req, res) => {
  try {
    const kit = await SiteKit.findOne({ kitId: req.params.kitId.toUpperCase() });
    if (!kit) return res.status(404).json({ message: "Kit not found" });
    res.json(kit);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// POST /api/sitekits/import  (multipart/form-data, field name "file")
// Upserts kits by kit_id. Existing kits have their components fully
// replaced by what's in the sheet (this is a re-sync, not a merge) —
// re-upload the whole sheet each time, not just changed rows.
exports.importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded. Attach it as 'file'." });
    }

    let kitDocs;
    try {
      kitDocs = parseSiteKitsExcel(req.file.buffer);
    } catch (parseErr) {
      return res.status(400).json({ message: parseErr.message });
    }

    const results = [];
    for (const doc of kitDocs) {
      let kit = await SiteKit.findOne({ kitId: doc.kitId });
      if (kit) {
        kit.name = doc.name;
        kit.band = doc.band;
        kit.sites = doc.sites;
        kit.components = doc.components;
      } else {
        kit = new SiteKit(doc);
      }
      kit.recomputeStatus();
      await kit.save();
      results.push({ kitId: kit.kitId, status: kit.status, components: kit.components.length });
    }

    res.json({
      message: `Imported ${results.length} kit(s) from the sheet.`,
      kits: results,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};
