const FieldOpsReport = require("../models/FieldOpsReport");

// POST /api/fieldops/sync
// body: {
//   jobId, clientSyncId, receivedItems, missingItems, installedItems,
//   signedBy, gps, clientTimestamp, submittedBy
// }
//
// clientSyncId is generated on the handheld the moment the engineer taps
// "Sync" (even while offline, before it's queued locally). Upserting on
// that id means: if the device retries the same queued entry after
// reconnecting — or the request is sent twice — the server just
// overwrites the same report instead of creating a duplicate.
exports.sync = async (req, res) => {
  try {
    const {
      jobId,
      clientSyncId,
      receivedItems,
      missingItems,
      installedItems,
      signedBy,
      gps,
      clientTimestamp,
    } = req.body;

    if (!jobId) return res.status(400).json({ message: "jobId is required" });
    if (!clientSyncId) return res.status(400).json({ message: "clientSyncId is required" });

    const report = await FieldOpsReport.findOneAndUpdate(
      { clientSyncId },
      {
        jobId,
        clientSyncId,
        receivedItems: receivedItems || [],
        missingItems: missingItems || [],
        installedItems: installedItems || [],
        signedBy: signedBy || "N/A",
        gps: gps || "N/A",
        clientTimestamp: clientTimestamp ? new Date(clientTimestamp) : new Date(),
        syncedAt: new Date(),
        // Derived from the verified JWT, not the request body.
        submittedBy: `${req.user.firstName} ${req.user.lastName}`.trim(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ message: "Field report synced", report });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// GET /api/fieldops/:jobId
// Returns every synced report for a job, most recent first, so the
// "server view" panel can show the latest state after a sync.
exports.getByJob = async (req, res) => {
  try {
    const reports = await FieldOpsReport.find({ jobId: req.params.jobId }).sort({
      syncedAt: -1,
    });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};
