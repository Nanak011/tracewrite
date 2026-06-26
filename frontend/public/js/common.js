const API_BASE_URL = window.API_BASE_URL || "http://localhost:3000";

const API = {
  async get(url) {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    return parseJson(res);
  },
  
  async post(url, body) {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body || {}),
    });
    return parseJson(res);
  },

  async put(url, body) {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body || {}),
    });
    return parseJson(res);
  },
  async delete(url) {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: "DELETE",
      credentials: "include",
    });
    return parseJson(res);
  },

};

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }
  return data;
}

function getQuery(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function showMessage(targetId, text, type = "info") {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.className = `auth-message ${type}`;
  el.textContent = text;
}

async function getCurrentUser() {
  try {
    const data = await API.get("/api/auth/me");
    return data.user || null;
  } catch (err) {
    return null;
  }
}


const CHAT_UNREAD_STORAGE_KEY = "collabwrite_chat_unread_v1";

function loadChatUnreadState() {
  try {
    const raw = localStorage.getItem(CHAT_UNREAD_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function saveChatUnreadState(state) {
  try {
    localStorage.setItem(CHAT_UNREAD_STORAGE_KEY, JSON.stringify(state || {}));
  } catch (err) {
    // Ignore storage failures.
  }
}

function getChatUnreadCount(key) {
  const state = loadChatUnreadState();
  return Number(state[key] || 0);
}

function setChatUnreadCount(key, value) {
  const state = loadChatUnreadState();
  const nextValue = Math.max(0, Number(value) || 0);
  if (nextValue <= 0) {
    delete state[key];
  } else {
    state[key] = nextValue;
  }
  saveChatUnreadState(state);
  updateChatNavBadge();
}

function incrementChatUnreadCount(key, amount = 1) {
  const state = loadChatUnreadState();
  state[key] = Math.max(0, Number(state[key] || 0) + Math.max(1, Number(amount) || 1));
  saveChatUnreadState(state);
  updateChatNavBadge();
}

function getTotalChatUnreadCount() {
  const state = loadChatUnreadState();
  return Object.values(state).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function ensureChatNavBadge(chatLink) {
  if (!chatLink) return;
  chatLink.classList.add("chat-nav-link");
}

function updateChatNavBadge() {
  const chatLinks = document.querySelectorAll('.menu-item[href="/chat"]');
  const hasUnread = getTotalChatUnreadCount() > 0;
  chatLinks.forEach((link) => {
    ensureChatNavBadge(link);
    link.classList.toggle("has-unread", hasUnread);
  });
}


function attachLogoutButton() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!window.confirm("Are you sure you want to log out?")) {
      return;
    }
    await API.post("/api/auth/logout", {});
    window.location.href = "/login";
  });
}
async function ensureSocketIoLoaded() {
  if (window.io) return;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cw-socket="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.dataset.cwSocket = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load socket.io client"));
    document.head.appendChild(script);
  });
}

async function initChatNotifications() {
  updateChatNavBadge();

  const chatLinks = document.querySelectorAll('.menu-item[href="/chat"]');
  if (!chatLinks.length) return;
  if (window.location.pathname === "/chat") return;

  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) return;

  try {
    await ensureSocketIoLoaded();
  } catch (err) {
    return;
  }

  if (window.__cwChatNotifierSocket) {
    return;
  }

  const socket = io();
  window.__cwChatNotifierSocket = socket;
  socket.emit("join_user_room", { userId: currentUser.id });

  socket.on("new_chat_message", (msg) => {
    if (Number(msg.user_id) === Number(currentUser.id)) return;
    incrementChatUnreadCount(`project-${msg.project_id}`);
  });

  socket.on("new_direct_message", (msg) => {
    if (Number(msg.to_user_id) !== Number(currentUser.id)) return;
    if (Number(msg.from_user_id) === Number(currentUser.id)) return;
    incrementChatUnreadCount(`user-${msg.from_user_id}`);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initChatNotifications().catch(() => {
    // Notification badge is best-effort.
  });
});

window.redirect = function(url) {
  window.location.assign(url);
};
