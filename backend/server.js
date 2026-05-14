const path = require("path");
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const dotenv = require("dotenv");
const { initDatabase } = require("./db");

const authRoutes = require("./server/routes/auth");

dotenv.config();

const FRONTEND_ROOT = path.resolve(__dirname, "..", "frontend");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "tracewrite-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use("/public", express.static(path.join(FRONTEND_ROOT, "public")));

app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  return res.redirect(req.session.user ? "/dashboard" : "/login");
});

app.get("/login", (req, res) => res.sendFile(path.join(FRONTEND_ROOT, "views", "login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(FRONTEND_ROOT, "views", "register.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(FRONTEND_ROOT, "views", "dashboard.html")));

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => app.listen(PORT, () => console.log(`TraceWrite running on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error("Failed to initialize schema:", err.message);
    process.exit(1);
  });