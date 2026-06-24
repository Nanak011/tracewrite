const { query } = require("../../db");

function registerSocketHandlers(io) {
  // Per-project presence cache keyed by socket id.
  const activeUsersByProject = new Map();
  // In-memory document cache to reduce repeated DB reads during active sessions.
  const documentByProject = new Map();

  io.on("connection", (socket) => {
    socket.on("join_user_room", ({ userId }) => {
      if (!userId) return;
      socket.join(`user_${Number(userId)}`);
    });

    socket.on("join_project", ({ projectId, user }) => {
      const room = `project_${projectId}`;
      socket.join(room);
      socket.data.projectId = projectId;
      socket.data.user = user;

      if (!activeUsersByProject.has(projectId)) {
        activeUsersByProject.set(projectId, new Map());
      }

      const usersMap = activeUsersByProject.get(projectId);
      usersMap.set(socket.id, user);

      io.to(room).emit("active_users", Array.from(usersMap.values()));
    });

    socket.on("join_document", async ({ projectId }) => {
      if (!projectId) return;
      const room = `document_${Number(projectId)}`;
      socket.join(room);

      if (!documentByProject.has(Number(projectId))) {
        const rows = await query("SELECT content FROM project_documents WHERE project_id = ?", [
          Number(projectId),
        ]);
        documentByProject.set(Number(projectId), rows[0]?.content || "");
      }

      socket.emit("document_init", { content: documentByProject.get(Number(projectId)) || "" });
    });

    // Full document updates are kept for backward compatibility with older events.
    socket.on("document_update", ({ projectId, userId, content }) => {
      if (!projectId) return;
      const key = Number(projectId);
      documentByProject.set(key, String(content || ""));

      io.to(`document_${key}`).emit("document_update", {
        projectId: key,
        userId,
        content: String(content || ""),
      });
    });

    socket.on("page_delta", ({ projectId, userId, pageNumber, delta, fullContent }) => {
      if (!projectId || !pageNumber || !delta) return;
      const key = Number(projectId);
      if (typeof fullContent === "string") {
        documentByProject.set(key, fullContent);
      }

      socket.to(`document_${key}`).emit("page_delta", {
        projectId: key,
        userId,
        pageNumber: Number(pageNumber),
        delta,
      });
    });

    socket.on("chat_message", async ({ projectId, userId, message }) => {
      if (!projectId || !userId || !message) return;

      await query("INSERT INTO chat_messages (project_id, user_id, message) VALUES (?, ?, ?)", [
        Number(projectId),
        Number(userId),
        String(message),
      ]);

      const sender = await query("SELECT name FROM users WHERE id = ?", [Number(userId)]);
      const payload = {
        project_id: Number(projectId),
        user_id: Number(userId),
        sender_name: sender[0]?.name || "Unknown",
        message: String(message),
        created_at: new Date().toISOString(),
      };

      const members = await query("SELECT user_id FROM project_members WHERE project_id = ?", [
        Number(projectId),
      ]);
      const rooms = [`project_${projectId}`];
      members.forEach((m) => rooms.push(`user_${m.user_id}`));

      io.to(rooms).emit("new_chat_message", payload);         
    });

    socket.on("direct_message", async ({ fromUserId, toUserId, message }) => {
      if (!fromUserId || !toUserId || !message) return;

      await query(
        "INSERT INTO direct_messages (from_user_id, to_user_id, message) VALUES (?, ?, ?)",
        [Number(fromUserId), Number(toUserId), String(message)]
      );

      const sender = await query("SELECT name FROM users WHERE id = ?", [Number(fromUserId)]);
      const payload = {
        from_user_id: Number(fromUserId),
        to_user_id: Number(toUserId),
        sender_name: sender[0]?.name || "Unknown",
        message: String(message),
        created_at: new Date().toISOString(),
      };

      io.to(`user_${Number(fromUserId)}`).emit("new_direct_message", payload);
      io.to(`user_${Number(toUserId)}`).emit("new_direct_message", payload);
    });

    socket.on("editor_presence", ({ projectId, pageNumber, user }) => {
      io.to(`project_${projectId}`).emit("editor_presence_update", {
        pageNumber,
        user,
        socketId: socket.id,
      });
    });

    socket.on("cursor_position", ({ projectId, pageNumber, range, user }) => {
      if (!projectId || !pageNumber) return;
      socket.to(`document_${Number(projectId)}`).emit("cursor_position", {
        projectId: Number(projectId),
        pageNumber: Number(pageNumber),
        range,
        user,
        socketId: socket.id,
      });
    });

    socket.on("cursor_clear", ({ projectId }) => {
      if (!projectId) return;
      socket.to(`document_${Number(projectId)}`).emit("cursor_clear", {
        projectId: Number(projectId),
        socketId: socket.id,
      });
    });

    socket.on("editor_activity", ({ projectId, pageNumber, action, user }) => {
      io.to(`project_${projectId}`).emit("editor_activity_update", {
        pageNumber,
        action,
        user,
        at: new Date().toISOString(),
      });
    });

    socket.on("disconnect", () => {
      const projectId = socket.data.projectId;
      if (!projectId || !activeUsersByProject.has(projectId)) return;

      io.to(`document_${Number(projectId)}`).emit("cursor_clear", {
        projectId: Number(projectId),
        socketId: socket.id,
      });

      const usersMap = activeUsersByProject.get(projectId);
      usersMap.delete(socket.id);

      io.to(`project_${projectId}`).emit("active_users", Array.from(usersMap.values()));
      if (usersMap.size === 0) {
        activeUsersByProject.delete(projectId);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
