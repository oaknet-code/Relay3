require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");
const connectDB = require("./src/config/db");

// Local-dev convenience only. This used to hardcode real staff emails and
// identical guessable passwords ("admin123", "manager123", ...) directly in
// source, unconditionally wiping every existing user first (`User.deleteMany()`)
// and inserting those accounts fresh. That script was committed to git and
// run against the shared production database, so those real accounts have
// been sitting with known passwords in both the live DB and git history.
//
// Real accounts are now created and managed through the app itself (the
// admin-created client-account flow, and admins created directly once via
// the database) — not by this script. This version only ever creates a
// single throwaway local admin, never deletes anything, and refuses to run
// unless explicitly opted into.
const seedUsers = async () => {
  if (process.env.SEED_ALLOW !== "true") {
    console.error(
      "Refusing to run: set SEED_ALLOW=true if you really want to create a " +
        "local throwaway admin account. This will NOT delete or modify any " +
        "existing users."
    );
    process.exit(1);
  }

  try {
    await connectDB();

    const email = process.env.SEED_ADMIN_EMAIL || "local-admin@example.test";

    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`User ${email} already exists — nothing to do.`);
      process.exit(0);
    }

    const password = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
    const hashedPassword = await bcrypt.hash(password, 12);

    await User.create({
      firstName: "Local",
      lastName: "Admin",
      email,
      password: hashedPassword,
      role: "admin",
      status: "active",
    });

    console.log(`✅ Created local admin ${email}`);
    console.log(`   Password: ${password}  (shown once — change it after logging in)`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedUsers();
