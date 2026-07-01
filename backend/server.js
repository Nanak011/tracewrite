const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const { initDatabase } = require("./db");



// routes
const authRoutes = require("./server/routes/auth");
const projectRoutes = require("./server/routes/projects");
const editorRoutes = require("./server/routes/editor");
const chatRoutes = require("./server/routes/chat");
const { registerSocketHandlers } = require("./server/sockets");



dotenv.config({ path: path.join(__dirname, ".env") });

//frontend path
const FRONTEND_ROOT = path.resolve(__dirname, "..", "frontend");


const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

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
app.use("/vendor", express.static(path.join(__dirname, "node_modules")));

//  api endpoints
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/editor", editorRoutes);
app.use("/api/chat", chatRoutes);
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
app.get("/editor", sendView("editor.html"));
app.get("/chat", sendView("chat.html"));
app.get("/profile", sendView("profile.html"));

registerSocketHandlers(io);

const PORT = Number(process.env.PORT || 3000);

// initialize database and start listening
initDatabase()
  .then(() => {

    server.listen(PORT, () => {
      console.log(`TraceWrite running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err.message);
    process.exit(1);
  });
    
  