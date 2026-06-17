(async function init() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "/views/login.html";
    return;
  }

  document.getElementById("userInfo").textContent = `${user.name} (${user.email})`;

  const invitationBox = document.getElementById("pendingInvitations");
  try {
    const inviteData = await API.get("/api/projects/invitations");
    const invites = inviteData.invitations || [];
    if (!invites.length) {
      invitationBox.textContent = "No pending invitations.";
    } else {
      invitationBox.innerHTML = invites
        .map(
          (inv) => `
            <div class="card" style="margin-bottom:8px;">
              <div><strong>${inv.project_title}</strong> invited by ${inv.inviter_name} as ${inv.role}</div>
              <div class="row-wrap" style="margin-top:8px;">
                <button data-invite="${inv.id}" data-action="accept" style="width:auto;">Accept</button>
                <button data-invite="${inv.id}" data-action="reject" style="width:auto;">Reject</button>
              </div>
            </div>
          `
        )
        .join("");
    }
  } catch (err) {
    invitationBox.textContent = "Unable to load invitations.";
  }

  invitationBox.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-invite]");
    if (!btn) return;
    const inviteId = Number(btn.getAttribute("data-invite"));
    const action = btn.getAttribute("data-action");

    try {
      await API.post(`/api/projects/invitations/${inviteId}/respond`, { action });
      btn.closest(".card")?.remove();
      if (!invitationBox.querySelector("[data-invite]")) {
        invitationBox.textContent = "No pending invitations.";
      }
    } catch (err) {
      alert(err.message);
    }
  });

  const projectsData = await API.get("/api/projects");
  const container = document.getElementById("projectCards");
  container.innerHTML = "";

  if (!projectsData.projects.length) {
    container.innerHTML = "<div class='card'>No projects yet. Go to Projects page to create one.</div>";
  } else {
    projectsData.projects.slice(0, 6).forEach((p) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h3>${p.title}</h3>
        <p class="muted">${p.description || "No description"}</p>
        <div class="row-wrap">
          <span class="badge">Role: ${p.role}</span>
          <span class="badge">Pages: ${p.total_pages}</span>
          <span class="badge">Members: ${p.member_count}</span>
        </div>
        <div class="row-wrap" style="margin-top:10px;">
          <a href="/views/editor.html?projectId=${p.id}"><button>Open Editor</button></a>
        </div>
      `;
      container.appendChild(card);
    });
  }
})();
