const API_BASE_URL = window.API_BASE_URL || "http://127.0.0.1:3000";

const API = {
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