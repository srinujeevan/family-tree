// Runs automatically before `npm test` (npm's "pretest" lifecycle hook).
// Creates the family_tree_test database (if it doesn't exist yet) on the
// same Postgres server as dev, then applies all committed migrations to it.
const path = require("node:path");
const { execSync } = require("node:child_process");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config({ path: path.join(__dirname, "..", ".env.test") });

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, "");

  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rowCount === 0) {
      // dbName comes from our own trusted .env.test, not user input.
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Created test database "${dbName}"`);
    }
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: process.env,
  });
}

main().catch((err) => {
  console.error("Failed to prepare test database:", err);
  process.exit(1);
});
