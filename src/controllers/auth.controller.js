const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET, // no fallback — server.js refuses to start without this set
    { expiresIn: "7d" }
  );

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body; // already validated/shaped by validateBody(loginSchema)

    const user = await User.findOne({ email });
    // Same generic message whether the email doesn't exist or the
    // password is wrong — don't help an attacker enumerate valid emails.
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (user.status === "suspended") {
      return res.status(403).json({ message: "This account has been suspended." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// Only reachable by an authenticated admin (see auth.routes.js) — this
// used to be a fully public endpoint that also echoed the generated
// plaintext password back in the response body. Restricting it to admins
// closes both: only a trusted operator sees that password now, and only
// an admin can create accounts at all.
exports.registerClient = async (req, res) => {
  try {
    const { username, email, company } = req.body; // validated by validateBody(registerClientSchema)

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "A user with this email already exists." });
    }

    const nameParts = username.trim().split(/\s+/);
    const firstName = nameParts[0] || "Client";
    const lastName = nameParts.slice(1).join(" ") || "Account";

    const generatedPassword = Math.random().toString(36).slice(-8) + "!";
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(generatedPassword, salt);

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      company: company || null,
      password: hashedPassword,
      role: "client", // lowercase — matches the User model's enum (previously "Client" didn't match at all and would throw)
      status: "active",
    });

    return res.status(201).json({
      message: "Client user registered successfully. Share this password with them securely — it will not be shown again.",
      temporaryPassword: generatedPassword,
      user: {
        id: newUser._id,
        username: `${newUser.firstName} ${newUser.lastName}`.trim(),
        email: newUser.email,
        company: newUser.company,
        role: newUser.role,
        status: newUser.status,
      },
    });
  } catch (err) {
    console.error("Error registering client:", err);
    res.status(500).json({ message: err.message || "Server error while registering client." });
  }
};

// GET /api/auth/clients — admin-only list of client accounts, so the
// admin UI has something to show after using register-client.
exports.listClients = async (req, res) => {
  try {
    const clients = await User.find({ role: "client" })
      .select("firstName lastName email company status createdAt")
      .sort({ createdAt: -1 });

    res.json(
      clients.map((c) => ({
        id: c._id,
        username: `${c.firstName} ${c.lastName}`.trim(),
        email: c.email,
        company: c.company,
        status: c.status,
        createdAt: c.createdAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// PATCH /api/auth/clients/:id/status — admin-only suspend/reactivate.
// Scoped to role: "client" so this can't be used to lock out another
// admin or staff account.
exports.setClientStatus = async (req, res) => {
  try {
    const { status } = req.body; // validated by validateBody(clientStatusSchema)

    const client = await User.findOne({ _id: req.params.id, role: "client" });
    if (!client) {
      return res.status(404).json({ message: "Client account not found" });
    }

    client.status = status;
    await client.save();

    res.json({
      id: client._id,
      username: `${client.firstName} ${client.lastName}`.trim(),
      email: client.email,
      company: client.company,
      status: client.status,
      createdAt: client.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id; // from protect middleware

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash and save new password
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Error changing password:", err);
    res.status(500).json({ message: "Server error while changing password" });
  }
};
