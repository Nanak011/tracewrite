const express = require("express");
const { requireAuth } = require("../controllers/authMiddleware");
const { requireProjectMember } = require("../controllers/projectAccess");
const chatController = require("../controllers/chatController");

const router = express.Router();

router.use(requireAuth);
router.get("/users", chatController.getAvailableUsers);
router.get("/:projectId/messages", requireProjectMember, chatController.getProjectMessages);
router.get("/direct/:otherUserId", chatController.getDirectMessages);

module.exports = router;
