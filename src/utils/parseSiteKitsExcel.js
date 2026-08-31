const XLSX = require("xlsx");

const REQUIRED_COLUMNS = [
  "kit_id",
  "kit_name",
  "band",
  "component_type",
  "component_model",
  "qty_required",
  "qty_available",
];

/**
 * Parses an uploaded Site Kits workbook (buffer) into an array of kit
 * objects ready to upsert into SiteKit. Expected columns, one row per
 * component:
 *
 *   kit_id | kit_name | band | sites | component_type | component_model
 *   | unit | qty_required | qty_available
 *
 * `sites` is comma-separated (e.g. "NBO-HUB, RVS-TWR"). `unit` is
 * optional and defaults to "ea".
 *
 * Throws a descriptive Error if required columns are missing or a row
 * has invalid data, so the controller can return a 400 with details.
 */
function parseSiteKitsExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) {
    throw new Error("The uploaded sheet has no data rows.");
  }

  const headerKeys = Object.keys(rows[0]).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !headerKeys.includes(c));
  if (missing.length) {
    throw new Error(`Missing required column(s): ${missing.join(", ")}`);
  }

  const kitsById = new Map();

  rows.forEach((raw, i) => {
    const rowNum = i + 2; // account for header row, 1-indexed
    // normalize keys to lowercase/trimmed so header casing doesn't matter
    const row = {};
    Object.entries(raw).forEach(([k, v]) => {
      row[k.trim().toLowerCase()] = typeof v === "string" ? v.trim() : v;
    });

    const kitId = String(row.kit_id || "").toUpperCase().trim();
    if (!kitId) throw new Error(`Row ${rowNum}: kit_id is required.`);

    const qtyRequired = Number(row.qty_required);
    const qtyAvailable = Number(row.qty_available);
    if (!Number.isFinite(qtyRequired) || qtyRequired < 0) {
      throw new Error(`Row ${rowNum}: qty_required must be a non-negative number.`);
    }
    if (!Number.isFinite(qtyAvailable) || qtyAvailable < 0) {
      throw new Error(`Row ${rowNum}: qty_available must be a non-negative number.`);
    }
    if (!row.component_type) {
      throw new Error(`Row ${rowNum}: component_type is required.`);
    }
    if (!row.component_model) {
      throw new Error(`Row ${rowNum}: component_model is required.`);
    }

    if (!kitsById.has(kitId)) {
      kitsById.set(kitId, {
        kitId,
        name: row.kit_name || kitId,
        band: row.band || "",
        sites: String(row.sites || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        components: [],
      });
    }

    kitsById.get(kitId).components.push({
      type: row.component_type,
      model: row.component_model,
      unit: row.unit || "ea",
      qtyRequired,
      qtyAvailable,
    });
  });

  return Array.from(kitsById.values());
}

module.exports = { parseSiteKitsExcel, REQUIRED_COLUMNS };
