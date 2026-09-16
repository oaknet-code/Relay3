const SiteKit = require("../models/SiteKit");
const StagingRecord = require("../models/StagingRecord");
const Asset = require("../models/Asset");
const { recordAudit } = require("../utils/audit");
const { assertTransition, InvalidTransitionError } = require("../services/stateMachine");

/**
 * GET /api/staging
 * List staging records (active/in-progress)
 */
exports.listStaging = async (req, res) => {
  try {
    const records = await StagingRecord.find({ deletedAt: null })
      .populate("kit", "kitId name band")
      .populate("link", "linkId name")
      .sort({ createdAt: -1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * GET /api/staging/awaiting
 * List kits ready for staging (READY_FOR_STAGING status, no active staging record)
 */
exports.listAwaitingStaging = async (req, res) => {
  try {
    const kits = await SiteKit.find({
      status: "READY_FOR_STAGING",
      deletedAt: null,
    })
      .populate("link", "linkId name")
      .sort({ createdAt: 1 });

    // Filter out kits that already have active staging records
    const activeStaging = await StagingRecord.find({
      status: { $ne: "STAGED" },
      deletedAt: null,
    }).select("kit");

    const activeStagingKitIds = new Set(
      activeStaging.map((s) => s.kit.toString())
    );

    const available = kits.filter(
      (k) => !activeStagingKitIds.has(k._id.toString())
    );

    res.json(available);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * POST /api/staging/:kitId/checkin
 * Check in a kit to the staging bay
 */
exports.checkInKit = async (req, res) => {
  try {
    const { kitId } = req.params;

    const kit = await SiteKit.findOne({ kitId: kitId.toUpperCase(), deletedAt: null });
    if (!kit) {
      return res.status(404).json({ message: "Kit not found" });
    }

    if (kit.status !== "READY_FOR_STAGING") {
      return res
        .status(409)
        .json({ message: "Kit must be in READY_FOR_STAGING status" });
    }

    // Create staging record
    const stagingRecord = await StagingRecord.create({
      kit: kit._id,
      kitId: kit.kitId,
      link: kit.link,
      status: "CHECKED_IN",
      checkedInBy: req.user._id,
      checkedInAt: new Date(),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    // Transition kit to STAGING
    try {
      assertTransition("SiteKit", kit.status, "STAGING");
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return res.status(err.status).json({ message: err.message });
      }
      throw err;
    }

    kit.status = "STAGING";
    kit.updatedBy = req.user._id;
    await kit.save();

    // Transition all allocated assets to STAGING
    await Asset.updateMany(
      { kit: kit._id, status: "ALLOCATED", deletedAt: null },
      {
        status: "STAGING",
        updatedBy: req.user._id,
      }
    );

    await recordAudit({
      entityType: "SiteKit",
      entityId: kit._id,
      action: "STATUS_CHANGE",
      fromStatus: "READY_FOR_STAGING",
      toStatus: "STAGING",
      user: req.user,
      notes: "Kit checked in to staging bay",
    });

    await stagingRecord.populate("kit", "kitId name band");
    res.status(201).json(stagingRecord);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * PATCH /api/staging/:stagingRecordId/qa
 * Update QA results for an asset in staging
 * Body: { assetId, tests: [{name, pass, value, notes}], configurationRecorded?: {...} }
 */
exports.updateQA = async (req, res) => {
  try {
    const { stagingRecordId } = req.params;
    const { assetId, tests, configurationRecorded } = req.body;

    const staging = await StagingRecord.findById(stagingRecordId);
    if (!staging || staging.deletedAt) {
      return res.status(404).json({ message: "Staging record not found" });
    }

    // Find or create QA result for this asset
    let qaResult = staging.qaResults.find(
      (q) => q.assetId?.toString() === assetId
    );
    if (!qaResult) {
      // Get asset serial for logging
      const asset = await Asset.findById(assetId).select(
        "serialNumber assetType"
      );
      qaResult = {
        assetId,
        assetSerial: asset?.serialNumber,
        assetType: asset?.assetType,
        tests: [],
      };
      staging.qaResults.push(qaResult);
    }

    // Update tests
    if (Array.isArray(tests)) {
      qaResult.tests = tests;
    }

    // Update configuration if provided
    if (configurationRecorded) {
      staging.configurationRecorded = {
        ...staging.configurationRecorded,
        ...configurationRecorded,
      };
    }

    staging.updatedBy = req.user._id;
    await staging.save();

    await recordAudit({
      entityType: "StagingRecord",
      entityId: staging._id,
      action: "UPDATE",
      user: req.user,
      notes: `QA updated for asset ${qaResult.assetSerial}`,
    });

    res.json(staging);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

/**
 * POST /api/staging/:stagingRecordId/complete
 * Mark staging complete, transition kit and assets to STAGED
 * All QA results must be passing
 */
exports.completeStaging = async (req, res) => {
  try {
    const { stagingRecordId } = req.params;

    const staging = await StagingRecord.findById(stagingRecordId).populate(
      "kit"
    );
    if (!staging || staging.deletedAt) {
      return res.status(404).json({ message: "Staging record not found" });
    }

    // Verify all QA tests passed
    const allPassed = staging.qaResults.every((qa) =>
      qa.tests.every((t) => t.pass === true)
    );

    if (!allPassed) {
      return res.status(409).json({
        message: "Cannot stage kit: not all QA tests passed",
      });
    }

    const kit = staging.kit;

    // Validate transitions
    try {
      assertTransition("SiteKit", kit.status, "STAGED");
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return res.status(err.status).json({ message: err.message });
      }
      throw err;
    }

    // Transition kit
    kit.status = "STAGED";
    kit.updatedBy = req.user._id;
    await kit.save();

    // Transition all assets to QA_PASSED then STAGED
    const assets = await Asset.find({
      kit: kit._id,
      status: "STAGING",
      deletedAt: null,
    });

    for (const asset of assets) {
      try {
        assertTransition("Asset", asset.status, "QA_PASSED");
        asset.status = "QA_PASSED";
        asset.updatedBy = req.user._id;
        await asset.save();

        assertTransition("Asset", asset.status, "STAGED");
        asset.status = "STAGED";
        await asset.save();
      } catch (err) {
        if (err instanceof InvalidTransitionError) {
          return res.status(err.status).json({ message: err.message });
        }
        throw err;
      }
    }

    // Mark staging complete
    staging.status = "STAGED";
    staging.stagedBy = req.user._id;
    staging.stagedAt = new Date();
    staging.updatedBy = req.user._id;
    await staging.save();

    await recordAudit({
      entityType: "SiteKit",
      entityId: kit._id,
      action: "STATUS_CHANGE",
      fromStatus: "STAGING",
      toStatus: "STAGED",
      user: req.user,
      notes: "QA passed, kit staged",
    });

    res.json(staging);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

module.exports = exports;
