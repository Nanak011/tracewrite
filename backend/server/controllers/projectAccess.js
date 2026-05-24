const {query} = require("../../db");

async function getProjectMembership(projectId, userId) {
    const rows = await query(
      `SELECT pm.role, pm.user_id, p.owner_id
      FROM project_membership pm
      JOIN projects p ON p.id = pm.project_id
      WHERE pm.project_id = ? AND pm.user_id = ?`,
      [projectId, userId]

    );
    return rows[0] || null;

}

async function requireProjectMember(req, res, next) {
    const projectId = Number(req.params.projectId || req.body.project_id || req.query.project_id);
    const userId = req.session.user.id;

    if (!projectId) {
        return res.status(400).json({error: "ProjectId is required"});
    }
    
    const membership = await getProjectMembership(projectId, userId);

    if(!membership) {

        return res.status(403).json({error: "Project access denied"});
    }

    req.projectId = projectId;
    req.projectRole = membership.role;
    next();

}

function requireProjectOwner(req, res, next) {
    if (req.projectRole !== "owner") {
        return res.status(403).json({error: "Project owner access required"});
    }
    return next();

}

module.exports = {
    getProjectMembership,
    requireProjectMember,
    requireProjectOwner
};