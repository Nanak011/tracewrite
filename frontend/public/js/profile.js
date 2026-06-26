(async function init() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "/login";
    return;
  }

  attachLogoutButton();

  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profileEmail").textContent = user.email;
  document.getElementById("emailVerifiedBadge").textContent = user.emailVerified ? "Verified" : "Not Verified";
  document.getElementById("emailVerifiedBadge").style.background = user.emailVerified ? "#dcfce7" : "#fee2e2";
  document.getElementById("emailVerifiedBadge").style.color = user.emailVerified ? "#166534" : "#991b1b";
  document.getElementById("mfaBadge").textContent = user.mfaEnabled ? "Enabled" : "Disabled";
  document.getElementById("mfaBadge").style.background = user.mfaEnabled ? "#dcfce7" : "#e5e7eb";
  document.getElementById("mfaBadge").style.color = user.mfaEnabled ? "#166534" : "#374151";
  document.getElementById("mfaEnabled").checked = Boolean(user.mfaEnabled);

  const colorEl = document.getElementById("profileColor");
  colorEl.textContent = user.color;
  colorEl.style.color = user.color;

  document.getElementById("resetPasswordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await API.post("/api/auth/reset-password", {
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value,
      });
      showMessage("passwordMessage", "Password updated successfully.", "info");
      document.getElementById("resetPasswordForm").reset();
    } catch (err) {
      showMessage("passwordMessage", err.message, "error");
    }
  });

  document.getElementById("mfaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const enabled = document.getElementById("mfaEnabled").checked;
      const result = await API.post("/api/auth/mfa", {
        enabled,
        currentPassword: document.getElementById("mfaCurrentPassword").value,
      });

      document.getElementById("mfaBadge").textContent = enabled ? "Enabled" : "Disabled";
      document.getElementById("mfaBadge").style.background = enabled ? "#dcfce7" : "#e5e7eb";
      document.getElementById("mfaBadge").style.color = enabled ? "#166534" : "#374151";
      document.getElementById("mfaCurrentPassword").value = "";
      showMessage("mfaMessage", result.message || "MFA setting updated", "info");
    } catch (err) {
      showMessage("mfaMessage", err.message, "error");
    }
  });
})();
