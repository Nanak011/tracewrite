const fs = require('fs');
const path = require('path');

describe('Frontend Authentication', () => {
  let loginHtml;
  let registerHtml;

  beforeAll(() => {
    loginHtml = fs.readFileSync(path.resolve(__dirname, '../views/login.html'), 'utf8');
    registerHtml = fs.readFileSync(path.resolve(__dirname, '../views/register.html'), 'utf8');
  });

  beforeEach(() => {
    jest.resetModules(); // Allows re-requiring scripts
    window.API = {
      post: jest.fn()
    };
    window.showMessage = jest.fn();
    window.redirect = jest.fn();
  });

  describe('Login Flow', () => {
    beforeEach(() => {
      document.body.innerHTML = loginHtml;
      // Load the actual script into the test environment
      require('../public/js/login.js');
      // Dispatch DOMContentLoaded to trigger script logic
      document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('Success - standard login redirects to dashboard', async () => {
      window.API.post.mockResolvedValueOnce({ user: { id: 1 } });

      document.getElementById("email").value = "test@example.com";
      document.getElementById("password").value = "Password123!";

      const form = document.getElementById("loginForm");
      form.dispatchEvent(new Event("submit"));

      await new Promise(process.nextTick);

      expect(window.API.post).toHaveBeenCalledWith("/api/auth/login", {
        email: "test@example.com",
        password: "Password123!"
      });
      expect(window.redirect).toHaveBeenCalledWith('/dashboard');
    });

    test('Success - MFA login shows OTP section', async () => {
      window.API.post.mockResolvedValueOnce({ mfaRequired: true, challengeToken: 'token123' });

      document.getElementById("email").value = "test@example.com";
      document.getElementById("password").value = "Password123!";

      const form = document.getElementById("loginForm");
      form.dispatchEvent(new Event("submit"));

      await new Promise(process.nextTick);

      expect(document.getElementById("loginForm").style.display).toBe("none");
      expect(document.getElementById("mfaForm").style.display).toBe("block");
      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "MFA OTP sent to your email.", "info");
    });

    test('Failure - invalid credentials shows error', async () => {
      window.API.post.mockRejectedValueOnce(new Error('Invalid credentials'));

      document.getElementById("email").value = "test@example.com";
      document.getElementById("password").value = "WrongPassword!";

      const form = document.getElementById("loginForm");
      form.dispatchEvent(new Event("submit"));

      await new Promise(process.nextTick);

      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "Invalid credentials", "error");
    });

    test('Success - Submitting MFA form redirects to dashboard', async () => {
      // First, trigger MFA flow to set the challenge token
      window.API.post.mockResolvedValueOnce({ mfaRequired: true, challengeToken: 'token123' });
      const loginForm = document.getElementById("loginForm");
      loginForm.dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      // Now submit MFA form
      window.API.post.mockResolvedValueOnce({ user: { id: 1 } });
      document.getElementById("mfaOtp").value = "123456";
      
      const mfaForm = document.getElementById("mfaForm");
      mfaForm.dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      expect(window.API.post).toHaveBeenCalledWith("/api/auth/verify-mfa", {
        challengeToken: "token123",
        otp: "123456"
      });
      expect(window.redirect).toHaveBeenCalledWith('/dashboard');
    });

    test('Failure - Invalid MFA code shows error', async () => {
      // First, trigger MFA flow to set the challenge token
      window.API.post.mockResolvedValueOnce({ mfaRequired: true, challengeToken: 'token123' });
      document.getElementById("loginForm").dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      // Now submit invalid MFA
      window.API.post.mockRejectedValueOnce(new Error('Invalid code'));
      document.getElementById("mfaOtp").value = "000000";
      
      document.getElementById("mfaForm").dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "Invalid code", "error");
    });
  });

  describe('Register Flow', () => {
    beforeEach(() => {
      document.body.innerHTML = registerHtml;
      // Load the actual script into the test environment
      require('../public/js/register.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('Success - registration shows OTP section', async () => {
      window.API.post.mockResolvedValueOnce({ email: 'test@example.com' });

      document.getElementById("name").value = "Test User";
      document.getElementById("email").value = "test@example.com";
      document.getElementById("password").value = "Password123!";

      const form = document.getElementById("registerForm");
      form.dispatchEvent(new Event("submit"));

      await new Promise(process.nextTick);

      expect(window.API.post).toHaveBeenCalledWith("/api/auth/register", {
        name: "Test User",
        email: "test@example.com",
        password: "Password123!"
      });
      expect(document.getElementById("verifyEmailLabel").textContent).toBe("test@example.com");
      expect(document.getElementById("registerForm").style.display).toBe("none");
      expect(document.getElementById("emailOtpSection").style.display).toBe("block");
      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "Registration complete. Enter the OTP sent to your email.", "info");
    });

    test('Failure - existing email shows error', async () => {
      window.API.post.mockRejectedValueOnce(new Error('Email already exists'));

      document.getElementById("name").value = "Test User";
      document.getElementById("email").value = "existing@example.com";
      document.getElementById("password").value = "Password123!";

      const form = document.getElementById("registerForm");
      form.dispatchEvent(new Event("submit"));

      await new Promise(process.nextTick);

      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "Email already exists", "error");
    });

    test('Success - OTP verification redirects to dashboard', async () => {
      // First, trigger registration to set pendingEmail
      window.API.post.mockResolvedValueOnce({ email: 'test@example.com' });
      document.getElementById("registerForm").dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      // Submit OTP
      window.API.post.mockResolvedValueOnce({ user: { id: 1 } });
      document.getElementById("emailOtp").value = "123456";
      
      const verifyForm = document.getElementById("verifyEmailForm");
      verifyForm.dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      expect(window.API.post).toHaveBeenCalledWith("/api/auth/verify-email", {
        email: "test@example.com",
        otp: "123456"
      });
      expect(window.redirect).toHaveBeenCalledWith('/dashboard');
    });

    test('Failure - Invalid OTP verification shows error', async () => {
      // Setup pending email
      window.API.post.mockResolvedValueOnce({ email: 'test@example.com' });
      document.getElementById("registerForm").dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      // Submit invalid OTP
      window.API.post.mockRejectedValueOnce(new Error('Invalid code'));
      document.getElementById("emailOtp").value = "000000";
      
      document.getElementById("verifyEmailForm").dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "Invalid code", "error");
    });

    test('Success - Resend OTP triggers API', async () => {
      // Setup pending email
      window.API.post.mockResolvedValueOnce({ email: 'test@example.com' });
      document.getElementById("registerForm").dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      // Click resend
      window.API.post.mockResolvedValueOnce({});
      document.getElementById("resendEmailOtpBtn").dispatchEvent(new Event("click"));
      await new Promise(process.nextTick);

      expect(window.API.post).toHaveBeenCalledWith("/api/auth/resend-verification-otp", {
        email: "test@example.com"
      });
      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "Verification OTP sent again.", "info");
    });

    test('Failure - Resend OTP fails if no pending email', async () => {
      // Don't setup pending email! Just click resend immediately.
      document.getElementById("resendEmailOtpBtn").dispatchEvent(new Event("click"));
      await new Promise(process.nextTick);

      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "No registration email found. Register first.", "error");
    });

    test('Failure - Resend OTP API failure shows error', async () => {
      // Setup pending email
      window.API.post.mockResolvedValueOnce({ email: 'test@example.com' });
      document.getElementById("registerForm").dispatchEvent(new Event("submit"));
      await new Promise(process.nextTick);

      // Click resend
      window.API.post.mockRejectedValueOnce(new Error('Resend failed'));
      document.getElementById("resendEmailOtpBtn").dispatchEvent(new Event("click"));
      await new Promise(process.nextTick);

      expect(window.showMessage).toHaveBeenCalledWith("authMessage", "Resend failed", "error");
    });
  });
});
