const express = require("express");
const authController = require("../controllers/authController");
const { requireAuth } = require("../controllers/authMiddleware");

const router = express.Router();

router.post("/register", authController.register);
router.post("/verify-email", authController.verifyEmailOtp);
router.post("/resend-verification-otp", authController.resendVerificationOtp);
router.post("/login", authController.login);
router.post("/verify-mfa", authController.verifyMfa);
router.post("/logout", authController.logout);
router.get("/me", authController.me);
router.post("/reset-password", requireAuth, authController.resetPassword);
router.post("/mfa", requireAuth, authController.updateMfa);

module.exports = router;
