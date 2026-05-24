const express = require("express");
const { requireAuth } = require("../controllers/authMiddleware");
const { requireProjectMember, requireProjectOwner } = require("../controllers/projectAccess");
const projectsController = require("../controllers/projectsController");

const router = express.Router();

router.use(requireAuth);

router.get("/", projectsController.listProjects);
router.post("/", projectsController.createProject);
router.get("/invitations", projectsController.listInvitations);
router.post("/invitations/:invitationId/respond", projectsController.respondInvitation);

router.get("/:projectId", requireProjectMember, projectsController.getProjectDetails);

router.post("/:projectId/invite", requireProjectMember, requireProjectOwner, projectsController.inviteMember);

router.delete(
	"/:projectId/members/:userId",
	requireProjectMember,
	requireProjectOwner,
	projectsController.removeMember
);

router.get("/:projectId/export", requireProjectMember, projectsController.exportProject);
router.delete("/:projectId", requireProjectMember, requireProjectOwner, projectsController.deleteProject);

module.exports = router;
