const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Verifies the Bearer token on every protected request. Nothing under
// /api/sitekits, /api/dispatch, or /api/fieldops was actually checking
// this before — the frontend sent a token, but the server never verified
// it, so every one of those endpoints was reachable by anyone with
// network access to the server, logged in or not.
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Not authenticated. No token provided." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const message =
        err.name === "TokenExpiredError" ? "Session expired, please log in again." : "Invalid token.";
      return res.status(401).json({ message });
    }

    // Re-fetch the user (rather than trusting the token payload alone) so
    // a deleted or suspended account is locked out immediately, even if
    // their existing token hasn't expired yet.
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "Account no longer exists." });
    }
    if (user.status === "suspended") {
      return res.status(403).json({ message: "This account has been suspended." });
    }

    req.user = user; // available to every downstream controller
    next();
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
}

module.exports = { protect };
