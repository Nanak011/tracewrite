function colorFromUserId(userId) {
  const palette = [
    "#0B5ED7",
    "#0D9488",
    "#CA8A04",
    "#B91C1C",
    "#7C3AED",
    "#0369A1",
    "#15803D",
    "#C2410C",
  ];
  const idx = Math.abs(Number(userId || 0)) % palette.length;
  return palette[idx];
}

const sanitizeHtml = require("sanitize-html");

function stripHtml(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

module.exports = { colorFromUserId, stripHtml};
