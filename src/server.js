const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") })
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const connectDB = require("./config/db");
const { generalLimiter } = require("./middleware/rateLimiters");

// Fail fast rather than silently signing tokens with a guessable fallback
// secret (the previous code had `process.env.JWT_SECRET || "fallback_secret"`
// baked into the sign call, which is a real risk if .env is ever missing
// in a deployed environment).
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error(
    "❌ JWT_SECRET is missing or too short (needs 32+ chars). Set a strong, random value in backend/.env before starting the server.",
  );
  process.exit(1);
}

const app = express();

// Security headers (helmet was already in package.json but never used).
app.use(helmet());

// CORS: restricted to the actual frontend origin instead of "*". Set
// FRONTEND_URL in backend/.env — defaults to the local Vite dev server.
const allowedOrigin = process.env.FRONTEND_URL || "https://oaknetrelay.oaknetbusiness.com";
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" })); // caps request body size

// Strips any request keys starting with "$" or containing "." — closes
// off NoSQL-operator-injection attempts (e.g. { email: { "$ne": null } })
// against Mongoose queries built from user input.
app.use(mongoSanitize());

// Blunt scripted abuse across the whole API; login has its own tighter
// limiter (see auth.routes.js).
app.use("/api", generalLimiter);

// Routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/inventory", require("./routes/inventory.routes"));
app.use("/api/links", require("./routes/links.routes"));
app.use("/api/sitekits", require("./routes/sitekits.routes"));
app.use("/api/staging", require("./routes/staging.routes"));
app.use("/api/dispatch", require("./routes/dispatch.routes"));
app.use("/api/fieldops", require("./routes/fieldops.routes"));

// API health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Relay Backend is running" });
});

// Centralized fallback error handler — keeps stack traces out of
// responses regardless of which route throws.
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Server error." });
});

const PORT = process.env.PORT || 5000;

// Start Server & Connect Database
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 Relay Backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Database connection error:", error);
    process.exit(1);
  }
};

startServer();
