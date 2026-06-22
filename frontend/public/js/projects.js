let currentUser;
let projects = [];
let selectedProjectRole = "Viewer";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMembers(members, ownerOnly) {
  const membersList = document.getElementById("membersList");
  if (!membersList) return;

  membersList.innerHTML = "";
  if (!members?.length) {
    membersList.innerHTML = '<div class="muted">No members found.</div>';
    return;
  }

  members.forEach((member) => {
    const isOwnerMember = member.role === "Owner";
    const canRemove = ownerOnly && !isOwnerMember;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div><strong>${escapeHtml(member.name)}</strong></div>
      <div class="muted">${escapeHtml(member.email)}</div>
      <div class="row-wrap" style="margin-top:8px;">
        <span class="badge">Role: ${escapeHtml(member.role)}</span>
        ${canRemove ? `<button class="danger-btn" data-remove-member="${member.user_id}" data-remove-name="${escapeHtml(member.name)}">Remove</button>` : ""}
      </div>
    `;
    membersList.appendChild(card);
  });
}

async function loadProjects() {
  const data = await API.get("/api/projects");
  projects = data.projects;

  const list = document.getElementById("projectsList");
  const select = document.getElementById("manageProjectSelect");
  list.innerHTML = "";
  select.innerHTML = "";

  projects.forEach((p) => {
    const item = document.createElement("div");
    item.className = "card";
    item.innerHTML = `
      <h4>${p.title}</h4>
      <div class="muted">${p.description || "No description"}</div>
      <div class="row-wrap" style="margin-top:8px;">
        <span class="badge">Project ID: ${p.id}</span>
        <span class="badge">Role: ${p.role}</span>
        <a href="/editor?projectId=${p.id}"><button>Editor</button></a>
        ${p.role === "Owner" ? `<button class="danger-btn" data-delete-project="${p.id}">Delete</button>` : ""}
      </div>
    `;
    list.appendChild(item);

    const option = document.createElement("option");
    option.value = String(p.id);
    option.textContent = `${p.id} - ${p.title} (${p.role})`;
    select.appendChild(option);
  });

  if (projects.length) {
    await refreshProjectManagement();
  }
}

async function refreshProjectManagement() {
  const projectId = Number(document.getElementById("manageProjectSelect").value);
  if (!projectId) return;

  const selectedProject = projects.find((p) => Number(p.id) === projectId);
  selectedProjectRole = selectedProject?.role || "Viewer";

  const ownerOnly = selectedProjectRole === "Owner";
  ["inviteEmail", "inviteRole"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !ownerOnly;
  });
  ["inviteForm"].forEach((id) => {
    const form = document.getElementById(id);
    if (form) {
      const btn = form.querySelector("button[type='submit']");
      if (btn) btn.disabled = !ownerOnly;
    }
  });

  if (!ownerOnly) {
    showMessage("manageMessage", "Only project owners can send invitations.", "info");
  } else {
    showMessage("manageMessage", "Owner mode enabled for this project.", "info");
  }

  try {
    const details = await API.get(`/api/projects/${projectId}`);
    renderMembers(details.members || [], ownerOnly);
  } catch (err) {
    renderMembers([], ownerOnly);
    showMessage("manageMessage", err.message, "error");
  }
}

(async function init() {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    window.location.href = "/login";
    return;
  }

  document.getElementById("createProjectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await API.post("/api/projects", {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
      });
      showMessage("projectMessage", "Project created successfully.", "info");
      await loadProjects();
    } catch (err) {
      showMessage("projectMessage", err.message, "error");
    }
  });

  document.getElementById("manageProjectSelect").addEventListener("change", refreshProjectManagement);

  document.getElementById("inviteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (selectedProjectRole !== "Owner") {
      showMessage("manageMessage", "Owner access required.", "error");
      return;
    }
    const projectId = Number(document.getElementById("manageProjectSelect").value);
    const email = document.getElementById("inviteEmail").value;
    const role = document.getElementById("inviteRole").value;

    if (!window.confirm(`Invite ${email} as ${role} to this project?`)) {
      return;
    }

    try {
      const result = await API.post(`/api/projects/${projectId}/invite`, {
        email,
        role,
      });
      showMessage("manageMessage", `${result?.message || "Invitation sent"} to ${email}.`, "info");
      window.alert(`Confirmation: invitation sent to ${email} as ${role}.`);
      document.getElementById("inviteEmail").value = "";
      await refreshProjectManagement();
    } catch (err) {
      showMessage("manageMessage", err.message, "error");
    }
  });

  document.getElementById("projectsList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-delete-project]");
    if (!btn) return;

    const deleteProjectId = Number(btn.getAttribute("data-delete-project"));
    if (!window.confirm("Delete this project permanently?")) return;

    try {
      await API.delete(`/api/projects/${deleteProjectId}`);
      showMessage("projectMessage", "Project deleted.", "info");
      await loadProjects();
    } catch (err) {
      showMessage("projectMessage", err.message, "error");
    }
  });

  document.getElementById("membersList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove-member]");
    if (!btn) return;
    if (selectedProjectRole !== "Owner") {
      showMessage("manageMessage", "Owner access required.", "error");
      return;
    }

    const projectId = Number(document.getElementById("manageProjectSelect").value);
    const userId = Number(btn.getAttribute("data-remove-member"));
    const name = btn.getAttribute("data-remove-name") || "this member";

    if (!window.confirm(`Remove ${name} from this project?`)) {
      return;
    }

    try {
      await API.delete(`/api/projects/${projectId}/members/${userId}`);
      showMessage("manageMessage", "Member removed successfully.", "info");
      await refreshProjectManagement();
    } catch (err) {
      showMessage("manageMessage", err.message, "error");
    }
  });

  await loadProjects();
})();

