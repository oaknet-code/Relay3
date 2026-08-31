require("dotenv").config();
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");
const connectDB = require("./src/config/db");

const seedUsers = async () => {
  try {
    await connectDB();

    await User.deleteMany();

    const users = [
      {
        username: "admin",
        email: "admin@relay.com",
        password: "admin123",
        role: "admin",
        firstName: "System",
        lastName: "Administrator",
      },
      {
        username: "mohamed",
        email: "mohamed@oaknetbusiness.com",
        password: "admin123",
        role: "admin",
        firstName: "Mohamed",
        lastName: "Oaknet",
      },
      {
        username: "bashir",
        email: "bashir@oaknetbusiness.com",
        password: "admin123",
        role: "admin",
        firstName: "Bashir",
        lastName: "Oaknet",
      },
      {
        username: "shamku",
        email: "shamku@oaknetbusiness.com",
        password: "admin123",
        role: "admin",
        firstName: "Shamku",
        lastName: "Oaknet",
      },
      {
        username: "dan",
        email: "dan.mwangi@oaknetbusiness.com",
        password: "admin123",
        role: "admin",
        firstName: "Dan",
        lastName: "Mwangi",
      },
      {
        username: "stan",
        email: "stan@oaknetbusiness.com",
        password: "admin123",
        role: "admin",
        firstName: "Stan",
        lastName: "Oaknet",
      },
      {
        username: "charles",
        email: "charles@oaknetbusiness.com",
        password: "admin123",
        role: "admin",
        firstName: "Charles",
        lastName: "Oaknet",
      },
      {
        username: "elizabeth",
        email: "elizabethleiyagu441@gmail.com",
        password: "admin123",
        role: "admin",
        firstName: "Elizabeth",
        lastName: "Leiyagu",
      },
      {
        username: "warehouse_manager",
        email: "j.okoth@relay.com",
        password: "manager123",
        role: "warehouse_manager",
        firstName: "James",
        lastName: "Okoth",
      },
      {
        username: "operator",
        email: "operator@relay.com",
        password: "operator123",
        role: "warehouse_operator",
        firstName: "Field",
        lastName: "Operator",
      },
      {
        username: "engineer",
        email: "engineer@relay.com",
        password: "engineer123",
        role: "site_engineer",
        firstName: "Site",
        lastName: "Engineer",
      },
    ];

    // Hash each user's password
    const usersWithHashedPasswords = await Promise.all(
      users.map(async (user) => ({
        ...user,
        password: await bcrypt.hash(user.password, 10),
      })),
    );

    await User.insertMany(usersWithHashedPasswords);

    console.log(`✅ MongoDB successfully seeded ${users.length} users!`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedUsers();
