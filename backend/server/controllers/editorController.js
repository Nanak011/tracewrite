const { query } = require("../../db");
const { sanitizeEditorHtml } = require("../serverHelpers");

/** fetch the HTML content of the project document. If no document exists in the project_documents table, it inserts a blank template. */

async function getProjectDocument(req, res) {
  try {
    const projectId = Number(req.params.projectId);

    // Query database for existing document
    const rows = await query(
      `SELECT pd.project_id, pd.content, pd.updated_at, pd.updated_by, p.title
       FROM project_documents pd
       JOIN projects p ON p.id = pd.project_id
       WHERE pd.project_id = ?`,
      [projectId]
    );

    // If no row is present, create an empty document row
    if (!rows.length) {
      await query(
        "INSERT INTO project_documents (project_id, content, updated_by) VALUES (?, ?, ?)",
        [projectId, "<p></p>", req.session.user.id]
      );

      // Refetch the newly created document
      const freshRows = await query(
        `SELECT pd.project_id, pd.content, pd.updated_at, pd.updated_by, p.title
         FROM project_documents pd
         JOIN projects p ON p.id = pd.project_id
         WHERE pd.project_id = ?`,
         [projectId]
      );
      return res.json({ document: freshRows[0], canEdit: req.projectRole !== "Viewer" });
    }

    return res.json({ document: rows[0], canEdit: req.projectRole !== "Viewer" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// save the document content.
async function saveProjectDocument(req, res) {
  try {
  
    const projectId = Number(req.params.projectId);
    const { content } = req.body;

    // Secure HTML string using sanitizeEditorHtml
    const safeContent = sanitizeEditorHtml(content || "");

    // Update existing document or insert fresh row if key collision occurs
    await query(
      `INSERT INTO project_documents (project_id, content, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [projectId, safeContent, req.session.user.id]
    );

    return res.json({ message: "Document saved successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getProjectDocument,
  saveProjectDocument,
};
