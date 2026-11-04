/**
 * Grants admin rights to one or more members.
 *
 *   npm run admin:setup                      # uses NEXT_PUBLIC_ADMIN_EMAIL
 *   npm run admin:setup -- someone@mail.com  # explicit address(es)
 *
 * Requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local. The service-role key must never be
 * exposed to the browser or committed to git.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing configuration. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local"
  );
  process.exit(1);
}

const emails = (
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "")
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean)
).map((email) => email.toLowerCase());

if (emails.length === 0) {
  console.error("No admin email supplied. Pass one as an argument or set NEXT_PUBLIC_ADMIN_EMAIL.");
  process.exit(1);
}

async function promote(email) {
  const response = await fetch(
    `${url}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email,is_admin`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ is_admin: true }),
    }
  );

  if (!response.ok) {
    throw new Error(`${email}: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();
  if (rows.length === 0) {
    console.warn(`⚠ ${email}: no profile found yet (has this member signed up?)`);
    return;
  }
  console.log(`✅ ${email} is now an admin`);
}

for (const email of emails) {
  try {
    await promote(email);
  } catch (error) {
    console.error(`✖ ${email}:`, error instanceof Error ? error.message : error);
  }
}

console.log("\nSign out and back in for the admin panel to pick up the new role.");
