const path = require("path");
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const dotenv = require("dotenv");
const { initDatabase } = require("./db");



// routes
const authRoutes = require("./server/routes/auth");
const projectRoutes = require("./server/routes/projects");


dotenv.config();


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


//  api endpoints
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);

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
    
  