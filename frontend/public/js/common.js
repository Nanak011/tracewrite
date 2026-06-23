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
};

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }
  return data;
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

// Wrapper to allow easy testing of redirects
window.redirect = function(url) {
  window.location.assign(url);
};
