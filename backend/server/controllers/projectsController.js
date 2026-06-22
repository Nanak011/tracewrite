const PDFDocument = require('pdfkit');
const { query } = require("../../db");
const { stripHtml } = require("../serverHelpers");

async function listProjects(req, res) {

    try{
        const rows = await query(
          `SELECT p.*, pm.role,
              (SELECT COUNT(*) FROM project_members x WHERE x.project_id = p.id) AS member_count
           FROM projects p
           JOIN project_members pm ON pm.project_id = p.id
           WHERE pm.user_id = ?
           ORDER BY p.created_at DESC`,    
           [req.session.user.id]
        );
        res.json({projects: rows});

    }
    catch(err) {
        res.status(500).json({error: err.message});
    }

}

async function createProject(req, res) {

    try{
        const {title, description} = req.body;
        const totalPages =1;

        if (!title || !description) {
            return res.status(400).json({error: "Title and description are required"});
        }

        const existingProject = await query(
            "SELECT id FROM projects WHERE title = ? AND owner_id = ?",
            [title, req.session.user.id]
        );

        if (existingProject.length > 0) {
            return res.status(409).json({ error: "You already have a project with this title" });
        }
        
        const result = await query(
            "INSERT INTO projects (title, description, owner_id, total_pages) VALUES (?, ?, ?, ?)",
            [title, description || "", req.session.user.id, totalPages]
        );

        const projectId = result.insertId;

        await query(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'Owner')",
            [projectId, req.session.user.id]
        );

        for (let i = 1; i <= totalPages; i+=1) {
            await query(
                "INSERT INTO pages (project_id, page_number, content) VALUES (?, ?, ?)",
                [projectId, i, ""]);
        }

        await query("INSERT INTO project_documents (project_id, content) VALUES (?, ?)", [projectId, ""]);

        res.json ({ message: "Project created successfully", projectId });

    }
    catch(err) {
        res.status(500).json({error: err.message});
    }
}


async function getProjectDetails(req, res) {
  try {
    const projectId = Number(req.params.projectId);

    const projectRows = await query("SELECT * FROM projects WHERE id = ?", [projectId]);
    if (!projectRows.length) {
      return res.status(404).json({ error: "Project not found" });
    }

    const members = await query(
      `SELECT pm.id, pm.user_id, pm.role, u.name, u.email
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?
       ORDER BY pm.id ASC`,
      [projectId]
    );

    res.json({ project: projectRows[0], members});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function inviteMember(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    const { email, role } = req.body;

    if (!["Editor", "Viewer"].includes(role)) {
      return res.status(400).json({ error: "role must be Editor or Viewer" });
    }

    const users = await query("SELECT id FROM users WHERE email = ?", [email]);
    if (!users.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = users[0].id;
    const existingMember = await query(
      "SELECT id FROM project_members WHERE project_id = ? AND user_id = ?",
      [projectId, userId]
    );

    if (existingMember.length) {
      return res.status(409).json({ error: "User is already a project member" });
    }

    const existingInvite = await query(
      `SELECT id FROM project_invitations
       WHERE project_id = ? AND invitee_id = ? AND status = 'Pending'`,
      [projectId, userId]
    );
    if (existingInvite.length) {
      return res.status(409).json({ error: "Pending invitation already exists" });
    }

    await query(
      "INSERT INTO project_invitations (project_id, inviter_id, invitee_id, role) VALUES (?, ?, ?, ?)",
      [
        projectId,
        req.session.user.id,
        userId,
        role,
      ]
    );

    res.json({ message: "Invitation sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function removeMember(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    const targetUserId = Number(req.params.userId);

    if (!targetUserId) {
      return res.status(400).json({ error: "Valid user id is required" });
    }

    const members = await query(
      `SELECT pm.user_id, pm.role
       FROM project_members pm
       WHERE pm.project_id = ? AND pm.user_id = ?`,
      [projectId, targetUserId]
    );

    if (!members.length) {
      return res.status(404).json({ error: "Member not found in this project" });
    }

    if (members[0].role === "Owner") {
      return res.status(400).json({ error: "Owner cannot be removed from project" });
    }

    await query("DELETE FROM project_members WHERE project_id = ? AND user_id = ?", [
      projectId,
      targetUserId,
    ]);

    await query(
      `UPDATE project_invitations
       SET status = 'Rejected', responded_at = NOW()
       WHERE project_id = ? AND invitee_id = ? AND status = 'Pending'`,
      [projectId, targetUserId]
    );

    return res.json({ message: "Member removed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function listInvitations(req, res) {
  try {
    const rows = await query(
      `SELECT pi.id, pi.project_id, pi.role, pi.status, pi.created_at,
          p.title AS project_title,
          u.name AS inviter_name
       FROM project_invitations pi
       JOIN projects p ON p.id = pi.project_id
       JOIN users u ON u.id = pi.inviter_id
       WHERE pi.invitee_id = ? AND pi.status = 'Pending'
       ORDER BY pi.created_at DESC`,
      [req.session.user.id]
    );

    res.json({ invitations: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function respondInvitation(req, res) {
  try {
    const invitationId = Number(req.params.invitationId);
    const { action } = req.body;

    if (!["accept", "reject"].includes(String(action || "").toLowerCase())) {
      return res.status(400).json({ error: "action must be accept or reject" });
    }

    const invites = await query(
      `SELECT * FROM project_invitations
       WHERE id = ? AND invitee_id = ? AND status = 'Pending'`,
      [invitationId, req.session.user.id]
    );
    if (!invites.length) {
      return res.status(404).json({ error: "Pending invitation not found" });
    }

    const invitation = invites[0];
    const status = String(action).toLowerCase() === "accept" ? "Accepted" : "Rejected";

    await query(
      "UPDATE project_invitations SET status = ?, responded_at = NOW() WHERE id = ?",
      [status, invitationId]
    );

    if (status === "Accepted") {
      await query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        [invitation.project_id, req.session.user.id, invitation.role]
      );
    }

    return res.json({ message: `Invitation ${status.toLowerCase()}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function deleteProject(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    await query("DELETE FROM projects WHERE id = ?", [projectId]);
    res.json({ message: "Project deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function exportProject(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    const format = String(req.query.format || "txt").toLowerCase();

    const projectRows = await query("SELECT * FROM projects WHERE id = ?", [projectId]);
    if (!projectRows.length) {
      return res.status(404).json({ error: "Project not found" });
    }

    const documentRows = await query(
      "SELECT content FROM project_documents WHERE project_id = ?",
      [projectId]
    );

    let merged = "";
    if (documentRows.length) {
      merged = stripHtml(documentRows[0].content || "");
    } else {
      const pages = await query(
        "SELECT page_number, content FROM pages WHERE project_id = ? ORDER BY page_number ASC",
        [projectId]
      );
      merged = pages
        .map((p) => `Page ${p.page_number}\n${stripHtml(p.content)}\n`)
        .join("\n");
    }

    const safeTitle = projectRows[0].title.replace(/[^a-z0-9-_]/gi, "_");

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=\"${safeTitle}.pdf\"`);
      const doc = new PDFDocument();
      doc.pipe(res);
      doc.fontSize(18).text(projectRows[0].title, { underline: true });
      doc.moveDown();
      doc.fontSize(11).text(merged);
      doc.end();
      return;
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename=\"${safeTitle}.txt\"`);
    return res.send(merged);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listProjects,
  createProject,
  getProjectDetails,
  inviteMember,
  removeMember,
  listInvitations,
  respondInvitation,
  deleteProject,
  exportProject,
};
