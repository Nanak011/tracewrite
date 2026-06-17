const path = require("path");
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const dotenv = require("dotenv");
const { initDatabase } = require("./db");



// routes
const authRoutes = require("./server/routes/auth");
const projectRoutes = require("./server/routes/projects");


dotenv.config({ path: path.join(__dirname, ".env") });

//frontend path
const FRONTEND_ROOT = path.resolve(__dirname, "..", "frontend");


const app = express();

// session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "tracewrite-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
  },
});


// middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json( {limit: "10mb"  }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// serve static files
app.use("/public", express.static(path.join(FRONTEND_ROOT, "public")));


//  api endpoints
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);

// HTML page routes

function sendView(file) {
  return (req, res) => res.sendFile(path.join(FRONTEND_ROOT,"views", file));
}

app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");}
return res.redirect("/login");
});

app.get("/login", sendView("login.html"));
app.get("/register", sendView("register.html"));
app.get("/dashboard", sendView("dashboard.html"));
app.get("/projects", sendView("projects.html"));


const PORT = Number(process.env.PORT || 3000);

// initialize database and start listening
initDatabase()
  .then(() => {

    app.listen(PORT, () => {
      console.log(`TraceWrite running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err.message);
    process.exit(1);
  });
    
  