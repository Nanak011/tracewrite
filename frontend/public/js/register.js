let pendingEmail = "";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const result = await API.post("/api/auth/register", {
        name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
      });

      pendingEmail = String(result.email || document.getElementById("email").value || "");
      document.getElementById("verifyEmailLabel").textContent = pendingEmail;
      document.getElementById("registerForm").style.display = "none";
      document.getElementById("emailOtpSection").style.display = "block";
      showMessage("authMessage", "Registration complete. Enter the OTP sent to your email.", "info");
    } catch (err) {
      showMessage("authMessage", err.message, "error");
    }
  });

  document.getElementById("verifyEmailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await API.post("/api/auth/verify-email", {
        email: pendingEmail,
        otp: document.getElementById("emailOtp").value,
      });
      window.location.href = "/dashboard";
    } catch (err) {
      showMessage("authMessage", err.message, "error");
    }
  });

  document.getElementById("resendEmailOtpBtn").addEventListener("click", async () => {
    try {
      if (!pendingEmail) {
        throw new Error("No registration email found. Register first.");
      }
      await API.post("/api/auth/resend-verification-otp", { email: pendingEmail });
      showMessage("authMessage", "Verification OTP sent again.", "info");
    } catch (err) {
      showMessage("authMessage", err.message, "error");
    }
  });
});