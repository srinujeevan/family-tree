// One-off helper: copies family data (families, persons, memberships,
// relationships, permissions, events, photo records) from the local dev
// database to a remote database such as Neon.
//
// Usage (PowerShell, from backend/):
//   $env:REMOTE_DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
//   node scripts/copy-local-data-to-remote.js
//
// - Login accounts are NOT copied. They must already exist remotely (run the
//   seed there first). Ownership is matched by email, because the same
//   account has a different id in each database.
// - Safe to re-run: rows that already exist remotely (same id) are skipped.
// - Everything runs in one transaction: either all of it is copied or none.
// - Photo FILES are not copied, only their database rows.
const { Client, types } = require("pg");

// Keep DATE/TIMESTAMP values as raw strings so nothing shifts by a time zone.
for (const oid of [1082, 1114, 1184]) {
  types.setTypeParser(oid, (value) => value);
}

const LOCAL_URL =
  process.env.LOCAL_DATABASE_URL ?? "postgresql://family_tree_app:changeme@localhost:5432/family_tree_db";
const REMOTE_URL = process.env.REMOTE_DATABASE_URL;

// Parent tables before child tables, so every foreign key target exists.
// userColumns hold user_accounts ids that must be remapped by email.
const TABLES = [
  { name: "persons", userColumns: ["created_by"] },
  { name: "families", userColumns: ["created_by"] },
  { name: "family_memberships", userColumns: [] },
  { name: "person_relationships", userColumns: [] },
  { name: "family_user_permissions", userColumns: ["user_id"] },
  { name: "person_events", userColumns: [] },
  { name: "person_photos", userColumns: [] },
];

function isLocalHost(url) {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

async function main() {
  if (!REMOTE_URL) {
    throw new Error("Set REMOTE_DATABASE_URL to the Neon connection string first.");
  }
  if (isLocalHost(REMOTE_URL)) {
    throw new Error("REMOTE_DATABASE_URL points at localhost - expected the remote (Neon) database.");
  }

  const local = new Client({ connectionString: LOCAL_URL });
  const remote = new Client({ connectionString: REMOTE_URL });
  await local.connect();
  await remote.connect();

  try {
    // local user id -> remote user id, matched by email
    const localUsers = (await local.query("SELECT id, email FROM user_accounts")).rows;
    const remoteUsers = (await remote.query("SELECT id, email FROM user_accounts")).rows;
    const remoteIdByEmail = new Map(remoteUsers.map((u) => [u.email.toLowerCase(), u.id]));
    const userIdMap = new Map();
    for (const u of localUsers) {
      const remoteId = remoteIdByEmail.get(u.email.toLowerCase());
      if (remoteId) userIdMap.set(u.id, remoteId);
    }

    await remote.query("BEGIN");
    for (const table of TABLES) {
      const rows = (await local.query(`SELECT * FROM "${table.name}"`)).rows;
      let inserted = 0;
      for (const row of rows) {
        for (const col of table.userColumns) {
          if (row[col] == null) continue;
          const mapped = userIdMap.get(row[col]);
          if (!mapped) {
            const email = localUsers.find((u) => u.id === row[col])?.email ?? row[col];
            throw new Error(
              `${table.name}.${col} refers to account "${email}", which doesn't exist remotely. Seed or create it there first.`,
            );
          }
          row[col] = mapped;
        }
        const cols = Object.keys(row);
        const sql =
          `INSERT INTO "${table.name}" (${cols.map((c) => `"${c}"`).join(", ")}) ` +
          `VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ON CONFLICT DO NOTHING`;
        const result = await remote.query(sql, cols.map((c) => row[c]));
        inserted += result.rowCount;
      }
      console.log(`${table.name.padEnd(24)} local: ${String(rows.length).padStart(4)}   copied: ${inserted}`);
    }
    await remote.query("COMMIT");
    console.log("Done - all data committed to the remote database.");
  } catch (err) {
    await remote.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await local.end();
    await remote.end();
  }
}

main().catch((err) => {
  console.error("Copy failed - nothing was changed remotely.\n", err.message);
  process.exit(1);
});
