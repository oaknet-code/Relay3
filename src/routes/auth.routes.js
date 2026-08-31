const express = require("express");
const router = express.Router();
const { login, registerClient } = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { loginLimiter } = require("../middleware/rateLimiters");
const { loginSchema, registerClientSchema, validateBody } = require("../middleware/validators");

// POST /api/auth/login — rate-limited (previously unlimited, so brute-forcing
// passwords had no throttle at all) and input-validated before it ever
// touches the database.
router.post("/login", loginLimiter, validateBody(loginSchema), login);

// POST /api/auth/register-client — this used to be completely public and
// returned the generated plaintext password to whoever called it. Now it
// requires a valid, non-suspended admin's token.
router.post(
  "/register-client",
  protect,
  authorize("admin"),
  validateBody(registerClientSchema),
  registerClient
);

module.exports = router;
