const { query } = require("../../db");

async function getAvailableUsers(req, res) {
  try {
    const users = await query(
      "SELECT id, name, email FROM users WHERE id <> ? ORDER BY name ASC",
      [req.session.user.id]
    );
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getProjectMessages(req, res) {
  try {
    const projectId = Number(req.params.projectId);

    const messages = await query(
      `SELECT cm.id, cm.project_id, cm.user_id, cm.message, cm.created_at,
          u.name AS sender_name
       FROM chat_messages cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.project_id = ?
       ORDER BY cm.created_at ASC
       LIMIT 300`,
      [projectId]
    );

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getDirectMessages(req, res) {
  try {
    const userId = req.session.user.id;
    const otherUserId = Number(req.params.otherUserId);

    if (!otherUserId) {
      return res.status(400).json({ error: "Valid otherUserId is required" });
    }

    const messages = await query(
      `SELECT dm.id, dm.from_user_id, dm.to_user_id, dm.message, dm.created_at,
          u.name AS sender_name
       FROM direct_messages dm
       JOIN users u ON u.id = dm.from_user_id
       WHERE (dm.from_user_id = ? AND dm.to_user_id = ?)
          OR (dm.from_user_id = ? AND dm.to_user_id = ?)
       ORDER BY dm.created_at ASC
       LIMIT 300`,
      [userId, otherUserId, otherUserId, userId]
    );

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAvailableUsers, getProjectMessages, getDirectMessages };
