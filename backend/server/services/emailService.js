const nodemailer = require("nodemailer");

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user, pass },
  });
}

async function sendOtpEmail({ to, name, otp, purpose }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "TraceWrite <no-reply@tracewrite.local>";
  const subject = purpose === "mfa_login" ? "Your TraceWrite MFA Code" : "Verify your TraceWrite email";
  const intro = purpose === "mfa_login"
    ? "Use this code to complete your login."
    : "Use this code to verify your email and activate your account.";

  const text = `${intro}\n\nCode: ${otp}\n\nThis code expires in 10 minutes.`;

  if (!transporter) {
    // Safe local fallback so developers can test OTP flows without paid infrastructure.
    // eslint-disable-next-line no-console
    console.log(`[OTP DEV MODE] ${purpose} code for ${to}: ${otp}`);
    return { simulated: true };
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });

  return { simulated: false };
}

module.exports = { sendOtpEmail };
