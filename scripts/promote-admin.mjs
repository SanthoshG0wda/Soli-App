// Promote an existing user to admin (or demote with --demote).
// Usage: node scripts/promote-admin.mjs user@firm.com [--demote]

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const email = process.argv[2];
const demote = process.argv.includes("--demote");
if (!email || email.startsWith("--")) {
  console.error("Usage: node scripts/promote-admin.mjs user@firm.com [--demote]");
  process.exit(1);
}
const role = demote ? "user" : "admin";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const rows = await sql`update users set role = ${role}, updated_at = now() where lower(email) = lower(${email}) returning id, email, role`;
  if (rows.length === 0) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }
  console.log(`${rows[0].email} is now '${rows[0].role}'.`);
} catch (e) {
  console.error("ERR " + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
} finally {
  await sql.end();
}
