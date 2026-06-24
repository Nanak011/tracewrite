let socket;
let currentProjectId;
let currentUser;
let currentMode = "group";
let currentDirectUserId = null;
let directUsers = [];
let userProjects = [];
let projectMembers = {}; // { projectId: [members] }

function clearChatBox() {
  document.getElementById("chatBox").innerHTML = "";
}

function appendMessage(msg, isMine = false) {
  const box = document.getElementById("chatBox");
  const line = document.createElement("div");
  line.className = `chat-message${isMine ? " mine" : ""}`;
  line.innerHTML = `
    <div class="muted" style="margin-bottom:4px;">${msg.sender_name} · ${new Date(msg.created_at).toLocaleString()}</div>
    <div class="chat-bubble">${msg.message}</div>
  `;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function renderConversationUI() {
  const carousel = document.getElementById("chatCarousel");
  const list = document.getElementById("chatThreadList");
  carousel.innerHTML = "";
  list.innerHTML = "";

  // Render group projects
  userProjects.forEach((proj) => {
    const unreadKey = `project-${proj.id}`;
    const unreadCount = getChatUnreadCount(unreadKey);
    const chip = document.createElement("div");
    chip.className = `chat-chip group-chip${currentMode === "group" && Number(currentProjectId) === Number(proj.id) ? " active" : ""}`;
    chip.innerHTML = `<strong>${proj.title || proj.name}</strong>${unreadCount > 0 ? `<span class="unread-dot" title="${unreadCount} unread"></span>` : ""}<br/><span class="muted">Group</span>`;
    chip.onclick = async () => {
      currentMode = "group";
      currentProjectId = Number(proj.id);
      setChatUnreadCount(unreadKey, 0);
      renderConversationUI();
      await loadGroupChat();
    };
    carousel.appendChild(chip);

    const item = document.createElement("div");
    item.className = `chat-thread-item group-item${currentMode === "group" && Number(currentProjectId) === Number(proj.id) ? " active" : ""}`;
    item.innerHTML = `<strong>${proj.title || proj.name}</strong>${unreadCount > 0 ? `<span class="unread-dot" title="${unreadCount} unread"></span>` : ""}<div class="muted">Project group</div>`;
    item.onclick = chip.onclick;
    list.appendChild(item);
  });

  // Render direct users
  directUsers.forEach((u) => {
    const unreadKey = `user-${u.id}`;
    const unreadCount = getChatUnreadCount(unreadKey);
    const chip = document.createElement("div");
    chip.className = `chat-chip${currentMode === "direct" && currentDirectUserId === Number(u.id) ? " active" : ""}`;
    chip.innerHTML = `<strong>${u.name}</strong>${unreadCount > 0 ? `<span class="unread-dot" title="${unreadCount} unread"></span>` : ""}<br/><span class="muted">Direct</span>`;
    chip.onclick = async () => {
      currentMode = "direct";
      currentDirectUserId = Number(u.id);
      setChatUnreadCount(unreadKey, 0);
      renderConversationUI();
      await loadDirectChat();
    };
    carousel.appendChild(chip);

    const item = document.createElement("div");
    item.className = `chat-thread-item${currentMode === "direct" && currentDirectUserId === Number(u.id) ? " active" : ""}`;
    item.innerHTML = `<strong>${u.name}</strong>${unreadCount > 0 ? `<span class="unread-dot" title="${unreadCount} unread"></span>` : ""}<div class="muted">${u.email}</div>`;
    item.onclick = chip.onclick;
    list.appendChild(item);
  });
}

async function loadUserProjects() {
  const data = await API.get("/api/projects");
  userProjects = data.projects || [];
  renderConversationUI();
}

async function loadDirectUsers() {
  const data = await API.get("/api/chat/users");
  directUsers = data.users || [];
  if (!currentDirectUserId && directUsers.length) {
    currentDirectUserId = Number(directUsers[0].id);
  }
  renderConversationUI();
}

async function loadGroupChat() {
  if (!currentProjectId) {
    showMessage("activeUsers", "Select a project group first.", "error");
    return;
  }

  setChatUnreadCount(`project-${currentProjectId}`, 0);

  const history = await API.get(`/api/chat/${currentProjectId}/messages`);
  clearChatBox();
  history.messages.forEach((msg) => appendMessage(msg, Number(msg.user_id) === Number(currentUser.id)));

  // Load project details for name and members
  let projectName = `Project #${currentProjectId}`;
  let membersList = [];
  
  const project = userProjects.find((p) => Number(p.id) === Number(currentProjectId));
  if (project) {
    projectName = project.title || project.name;
  }
  
  // Load members for this project
  if (!projectMembers[currentProjectId]) {
    try {
      const projectDetails = await API.get(`/api/projects/${currentProjectId}`);
      projectMembers[currentProjectId] = projectDetails.members || [];
    } catch (err) {
      console.error("Failed to load project members:", err);
    }
  }
  
  membersList = projectMembers[currentProjectId] || [];
  const memberNames = membersList.map(m => m.name).join(", ");
  
  document.getElementById("chatThreadTitle").innerHTML = `<strong>${projectName}</strong><div class="muted">Group chat with: ${memberNames || "loading members..."}</div>`;
  document.getElementById("activeUsers").textContent = memberNames ? `Members: ${memberNames}` : "Loading members...";
  
  socket.emit("join_project", { projectId: currentProjectId, user: currentUser });
  renderConversationUI();
}

async function loadDirectChat() {
  if (!currentDirectUserId) {
    showMessage("activeUsers", "Select a user for direct chat.", "error");
    return;
  }

  setChatUnreadCount(`user-${currentDirectUserId}`, 0);

  const history = await API.get(`/api/chat/direct/${currentDirectUserId}`);
  clearChatBox();
  history.messages.forEach((msg) => appendMessage(msg, Number(msg.from_user_id) === Number(currentUser.id)));

  const selected = directUsers.find((u) => Number(u.id) === Number(currentDirectUserId));
  document.getElementById("chatThreadTitle").innerHTML = `<strong>${selected?.name || "Direct Chat"}</strong><div class="muted">Private conversation</div>`;
  document.getElementById("activeUsers").textContent = "Direct message thread";
  renderConversationUI();
}

(async function init() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    window.location.href = "/login";
    return;
  }

  socket = io();
  socket.emit("join_user_room", { userId: currentUser.id });

  const initialProjectId = getQuery("projectId");
  if (initialProjectId) {
    currentProjectId = Number(initialProjectId);
  }

  await loadUserProjects();
  await loadDirectUsers();
  
  // Auto-load first project if available and no specific project was requested
  if (!currentProjectId && userProjects.length) {
    currentProjectId = Number(userProjects[0].id);
    await loadGroupChat();
  }

  socket.on("new_chat_message", (msg) => {
    const isActiveGroupThread = currentMode === "group" && Number(msg.project_id) === Number(currentProjectId);
    if (isActiveGroupThread) {
      appendMessage(msg, Number(msg.user_id) === Number(currentUser.id));
    } else if (Number(msg.user_id) !== Number(currentUser.id)) {
      const key = `project-${msg.project_id}`;
      incrementChatUnreadCount(key);
      renderConversationUI();
    }
  });

  socket.on("new_direct_message", (msg) => {
    const isCurrentThread =
      currentMode === "direct" &&
      ((Number(msg.from_user_id) === Number(currentUser.id) && Number(msg.to_user_id) === Number(currentDirectUserId)) ||
        (Number(msg.from_user_id) === Number(currentDirectUserId) && Number(msg.to_user_id) === Number(currentUser.id)));

    if (isCurrentThread) {
      appendMessage(msg, Number(msg.from_user_id) === Number(currentUser.id));
    } else if (Number(msg.to_user_id) === Number(currentUser.id)) {
      const senderId = Number(msg.from_user_id);
      const key = `user-${senderId}`;
      incrementChatUnreadCount(key);
      renderConversationUI();
    }
  });

  socket.on("active_users", (users) => {
    if (currentMode === "group") {
      document.getElementById("activeUsers").textContent = `Active users: ${users.map((u) => u.name).join(", ")}`;
    }
  });

  const sendChatBtn = document.getElementById("sendChatBtn");
  const chatInput = document.getElementById("chatInput");

  const sendMessage = () => {
    const message = chatInput.value.trim();
    if (!message) return;

    if (currentMode === "group") {
      if (!currentProjectId) {
        showMessage("activeUsers", "Choose a project group first.", "error");
        return;
      }
      socket.emit("chat_message", {
        projectId: currentProjectId,
        userId: currentUser.id,
        message,
      });
    } else {
      if (!currentDirectUserId) {
        showMessage("activeUsers", "Choose a user first.", "error");
        return;
      }
      socket.emit("direct_message", {
        fromUserId: currentUser.id,
        toUserId: currentDirectUserId,
        message,
      });
    }

    chatInput.value = "";
    chatInput.style.height = "auto";
  };

  sendChatBtn.addEventListener("click", sendMessage);

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });
})();
