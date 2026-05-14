const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query } = require("../../db");
const { colorFromUserId } = require("../serverHelpers");
const { sendOtpEmail } = require("../services/emailService");

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function createOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashOtp(otp) {
  const secret = process.env.OTP_SECRET || process.env.SESSION_SECRET || "tracewrite-otp-secret";
  return crypto.createHash("sha256").update(`${String(otp)}.${secret}`).digest("hex");
}

function buildSessionUser(userRow) {
  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    color: colorFromUserId(userRow.id),
    emailVerified: Boolean(userRow.email_verified),
    mfaEnabled: Boolean(userRow.mfa_enabled),
  };
}

async function issueOtp({ userId, email, name, purpose, challengeToken = null }) {
  const otp = createOtpCode();
  const otpHash = hashOtp(otp);

  await query(
    `DELETE FROM otp_codes
     WHERE user_id = ?
       AND purpose = ?
       AND consumed_at IS NULL`,
    [Number(userId), String(purpose)]
  );

  await query(
    `INSERT INTO otp_codes (user_id, email, purpose, challenge_token, otp_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [Number(userId), String(email), String(purpose), challengeToken, otpHash, OTP_TTL_MINUTES]
  );

  await sendOtpEmail({ to: email, name, otp, purpose });
}

async function loadActiveOtpByEmail({ email, purpose }) {
  const rows = await query(
    `SELECT oc.id, oc.user_id, oc.otp_hash, oc.attempts, oc.expires_at,
            u.id AS user_id_ref, u.name, u.email, u.email_verified, u.mfa_enabled
     FROM otp_codes oc
     JOIN users u ON u.id = oc.user_id
     WHERE oc.email = ?
       AND oc.purpose = ?
       AND oc.consumed_at IS NULL
     ORDER BY oc.id DESC
     LIMIT 1`,
    [String(email), String(purpose)]
  );
  return rows[0] || null;
}

function isOtpExpired(otpRow) {
  return new Date(otpRow.expires_at).getTime() < Date.now();
}

async function validateOtpAttempt({ otpRow, otp }) {
  if (!otpRow) {
    return { ok: false, reason: "Invalid or expired code" };
  }

  if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "Too many invalid attempts. Request a new code." };
  }

  if (isOtpExpired(otpRow)) {
    return { ok: false, reason: "Code expired. Request a new code." };
  }

  const submittedHash = hashOtp(otp);
  if (submittedHash !== otpRow.otp_hash) {
    await query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", [otpRow.id]);
    return { ok: false, reason: "Invalid code" };
  }

  await query("UPDATE otp_codes SET consumed_at = NOW() WHERE id = ?", [otpRow.id]);
  return { ok: true };
}

async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    const cleanEmail = normalizeEmail(email);
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await query(
      "SELECT id, name, email_verified FROM users WHERE email = ? LIMIT 1",
      [cleanEmail]
    );
    if (existing.length) {
      const existingUser = existing[0];
      if (Number(existingUser.email_verified) === 1) {
        return res.status(409).json({ error: "Email already exists" });
      }

      // Allow users who abandoned verification to restart registration on the same email.
      const hashed = await bcrypt.hash(password, 10);
      await query(
        "UPDATE users SET name = ?, password = ?, mfa_enabled = 0 WHERE id = ?",
        [String(name).trim(), hashed, existingUser.id]
      );

      await issueOtp({
        userId: existingUser.id,
        email: cleanEmail,
        name: String(name).trim(),
        purpose: "email_verify",
      });

      return res.json({
        message: "Account exists but is not verified. We sent a new verification OTP.",
        requiresVerification: true,
        email: cleanEmail,
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO users (name, email, password, email_verified, mfa_enabled) VALUES (?, ?, ?, 0, 0)",
      [String(name).trim(), cleanEmail, hashed]
    );

    await issueOtp({
      userId: result.insertId,
      email: cleanEmail,
      name: String(name).trim(),
      purpose: "email_verify",
    });

    return res.json({
      message: "Registration successful. Verify your email with the OTP sent.",
      requiresVerification: true,
      email: cleanEmail,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function verifyEmailOtp(req, res) {
  try {
    const cleanEmail = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();

    if (!cleanEmail || !otp) {
      return res.status(400).json({ error: "email and otp are required" });
    }

    const otpRow = await loadActiveOtpByEmail({ email: cleanEmail, purpose: "email_verify" });
    const verdict = await validateOtpAttempt({ otpRow, otp });
    if (!verdict.ok) {
      return res.status(400).json({ error: verdict.reason });
    }

    await query("UPDATE users SET email_verified = 1 WHERE id = ?", [otpRow.user_id]);
    const users = await query(
      "SELECT id, name, email, email_verified, mfa_enabled FROM users WHERE id = ?",
      [otpRow.user_id]
    );

    const user = buildSessionUser(users[0]);
    req.session.user = user;

    return res.json({ message: "Email verified successfully", user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function resendVerificationOtp(req, res) {
  try {
    const cleanEmail = normalizeEmail(req.body.email);
    if (!cleanEmail) {
      return res.status(400).json({ error: "email is required" });
    }

    const users = await query(
      "SELECT id, name, email, email_verified FROM users WHERE email = ?",
      [cleanEmail]
    );

    if (!users.length) {
      return res.json({ message: "If the email exists, a verification code has been sent." });
    }

    const user = users[0];
    if (Number(user.email_verified) === 1) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    await issueOtp({
      userId: user.id,
      email: user.email,
      name: user.name,
      purpose: "email_verify",
    });

    return res.json({ message: "Verification OTP sent" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    const cleanEmail = normalizeEmail(email);
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const rows = await query("SELECT * FROM users WHERE email = ?", [cleanEmail]);
    if (!rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const userRow = rows[0];
    const valid = await bcrypt.compare(password, userRow.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!userRow.email_verified) {
      await issueOtp({
        userId: userRow.id,
        email: userRow.email,
        name: userRow.name,
        purpose: "email_verify",
      });

      return res.status(403).json({
        error: "Email not verified. We sent a new OTP to your email.",
        requiresVerification: true,
        email: userRow.email,
      });
    }

    if (userRow.mfa_enabled) {
      const challengeToken = crypto.randomUUID();
      await issueOtp({
        userId: userRow.id,
        email: userRow.email,
        name: userRow.name,
        purpose: "mfa_login",
        challengeToken,
      });

      return res.json({
        message: "MFA code sent to your email",
        mfaRequired: true,
        challengeToken,
      });
    }

    const user = buildSessionUser(userRow);

    req.session.user = user;
    return res.json({ message: "Logged in", user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function verifyMfa(req, res) {
  try {
    const challengeToken = String(req.body.challengeToken || "").trim();
    const otp = String(req.body.otp || "").trim();
    if (!challengeToken || !otp) {
      return res.status(400).json({ error: "challengeToken and otp are required" });
    }

    const rows = await query(
      `SELECT oc.id, oc.user_id, oc.otp_hash, oc.attempts, oc.expires_at,
              u.id AS uid, u.name, u.email, u.email_verified, u.mfa_enabled
       FROM otp_codes oc
       JOIN users u ON u.id = oc.user_id
       WHERE oc.challenge_token = ?
         AND oc.purpose = 'mfa_login'
         AND oc.consumed_at IS NULL
       ORDER BY oc.id DESC
       LIMIT 1`,
      [challengeToken]
    );

    const otpRow = rows[0] || null;
    const verdict = await validateOtpAttempt({ otpRow, otp });
    if (!verdict.ok) {
      return res.status(400).json({ error: verdict.reason });
    }

    const user = buildSessionUser({
      id: otpRow.uid,
      name: otpRow.name,
      email: otpRow.email,
      email_verified: otpRow.email_verified,
      mfa_enabled: otpRow.mfa_enabled,
    });

    req.session.user = user;
    return res.json({ message: "Logged in", user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
}

async function me(req, res) {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const rows = await query(
      "SELECT id, name, email, email_verified, mfa_enabled FROM users WHERE id = ?",
      [req.session.user.id]
    );
    if (!rows.length) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = buildSessionUser(rows[0]);
    req.session.user = user;
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function resetPassword(req, res) {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "currentPassword and newPassword (min 6 chars) are required" });
    }

    const rows = await query("SELECT password FROM users WHERE id = ?", [req.session.user.id]);
    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, rows[0].password);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password = ? WHERE id = ?", [hashed, req.session.user.id]);
    return res.json({ message: "Password updated successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function updateMfa(req, res) {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const enabled = req.body.enabled;
    const currentPassword = String(req.body.currentPassword || "");

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be boolean" });
    }

    if (!currentPassword) {
      return res.status(400).json({ error: "currentPassword is required" });
    }

    const rows = await query(
      "SELECT id, name, email, password, email_verified, mfa_enabled FROM users WHERE id = ?",
      [req.session.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const userRow = rows[0];
    const valid = await bcrypt.compare(currentPassword, userRow.password);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    if (enabled && !userRow.email_verified) {
      return res.status(400).json({ error: "Verify your email before enabling MFA" });
    }

    await query("UPDATE users SET mfa_enabled = ? WHERE id = ?", [enabled ? 1 : 0, userRow.id]);

    const user = buildSessionUser({
      ...userRow,
      mfa_enabled: enabled ? 1 : 0,
    });
    req.session.user = user;

    return res.json({
      message: enabled ? "MFA enabled" : "MFA disabled",
      user,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  register,
  verifyEmailOtp,
  resendVerificationOtp,
  login,
  verifyMfa,
  logout,
  me,
  resetPassword,
  updateMfa,
};
