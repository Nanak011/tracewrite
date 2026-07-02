const express = require("express");
const router = express.Router();
const { formatLive, downloadFormatted } = require("../controllers/formatterController");
const { requireAuth } = require("../controllers/authMiddleware");
const { requireProjectMember } = require("../controllers/projectAccess");

// Live formatting endpoint
router.post(
  "/:projectId/format-live",
  requireAuth,
  requireProjectMember,
  formatLive
);

// Download formatted document
router.get(
  "/:projectId/download/:docId",
  requireAuth,
  downloadFormatted
);

module.exports = router;
