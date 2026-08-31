const rateLimit = require("express-rate-limit");

// express-rate-limit was already in package.json but never actually wired
// into any route — meaning /api/auth/login had zero protection against
// password brute-forcing before this.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in a few minutes." },
});

// A softer general limiter for the rest of the API, mainly to blunt
// scripted abuse/scraping rather than targeted brute force.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, generalLimiter };
