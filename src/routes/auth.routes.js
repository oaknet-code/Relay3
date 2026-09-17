const express = require("express");
const router = express.Router();
const { login, registerClient, listClients, setClientStatus, changePassword } = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { loginLimiter } = require("../middleware/rateLimiters");
const { loginSchema, registerClientSchema, clientStatusSchema, validateBody } = require("../middleware/validators");

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

// GET /api/auth/clients — admin-only list of client accounts
router.get("/clients", protect, authorize("admin"), listClients);

// PATCH /api/auth/clients/:id/status — admin-only suspend/reactivate
router.patch(
  "/clients/:id/status",
  protect,
  authorize("admin"),
  validateBody(clientStatusSchema),
  setClientStatus
);

// PUT /api/auth/change-password — requires authenticated user
router.put("/change-password", protect, changePassword);

module.exports = router;
