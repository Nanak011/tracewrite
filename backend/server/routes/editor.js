const express = require("express");
const { requireAuth } = require("../controllers/authMiddleware");
const { requireProjectMember } = require("../controllers/projectAccess");
const editorController = require("../controllers/editorController");

const router = express.Router();

//all editor routes require authentication
router.use(requireAuth);

// Get the project's document content
router.get("/:projectId/document", requireProjectMember, editorController.getProjectDocument);

// save project document content
router.put("/:projectId/document", requireProjectMember, editorController.saveProjectDocument);

module.exports = router;
