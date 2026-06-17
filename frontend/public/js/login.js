let mfaChallengeToken = "";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const result = await API.post("/api/auth/login", {
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
      });

      if (result.mfaRequired) {
        mfaChallengeToken = String(result.challengeToken || "");
        document.getElementById("loginForm").style.display = "none";
        document.getElementById("mfaForm").style.display = "block";
        showMessage("authMessage", "MFA OTP sent to your email.", "info");
        return;
      }

      window.location.href = "/views/dashboard.html";
    } catch (err) {
      showMessage("authMessage", err.message, "error");
    }
  });

  document.getElementById("mfaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await API.post("/api/auth/verify-mfa", {
        challengeToken: mfaChallengeToken,
        otp: document.getElementById("mfaOtp").value,
      });
      window.location.href = "/views/dashboard.html";
    } catch (err) {
      showMessage("authMessage", err.message, "error");
    }
  });
});