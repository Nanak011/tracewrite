// function colorFromUserId(userId) {
//   const palette = [
//     "#0B5ED7",
//     "#0D9488",
//     "#CA8A04",
//     "#B91C1C",
//     "#7C3AED",
//     "#0369A1",
//     "#15803D",
//     "#C2410C",
//   ];
//   const idx = Math.abs(Number(userId || 0)) % palette.length;
//   return palette[idx];
// }
// new color palette logic
function colorFromUserId(userId) {
  const id = String(userId || "");
  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  }

  const hue = (hash * 137.508) % 360;
  const saturation = 65;
  const lightness = 48;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

const sanitizeHtml = require("sanitize-html");

function stripHtml(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}


function sanitizeEditorHtml(value = "") {
  return sanitizeHtml(String(value || ""), {
    allowedTags: [
      "p", "br", "strong", "em", "u", "s", "blockquote",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "span", "div",
      "table", "thead", "tbody", "tr", "th", "td",
      "img", "a",
    ],
    allowedAttributes: {
      span: ["style"],
      div: ["style"],
      p: ["style", "class", "data-author-id"],
      th: ["colspan", "rowspan", "style"],
      td: ["colspan", "rowspan", "style"],
      img: [
        "src",
        "alt",
        "width",
        "height",
        "style",
        "data-width",
        "data-height",
        "data-orig-width",
        "data-orig-height",
        "data-aspect-ratio",
      ],
      a: ["href", "target", "rel"],
    },
    allowedStyles: {
      img: {
        width: [/^\d+px$/],
        height: [/^\d+px$/],
        "max-width": [/^\d+%$/],
        display: [/^inline-block$/, /^block$/],
      },
      p: {
        "margin-left": [/^\d+px$/],
        "text-align": [/^left$/, /^center$/, /^right$/, /^justify$/],
      },
      span: {
        color: [
          /^#[0-9a-fA-F]{3,8}$/,
          /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
          /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/,
        ],
        "background-color": [
          /^#[0-9a-fA-F]{3,8}$/,
          /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
          /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/,
        ],
      },
      div: {
        "text-align": [/^left$/, /^center$/, /^right$/, /^justify$/],
      },
      th: {
        "text-align": [/^left$/, /^center$/, /^right$/, /^justify$/],
      },
      td: {
        "text-align": [/^left$/, /^center$/, /^right$/, /^justify$/],
      },
    },
    allowedSchemes: ["http", "https", "data"],
    allowProtocolRelative: false,
  });
}

module.exports = { colorFromUserId, stripHtml, sanitizeEditorHtml };
