/**
 * Pre-flight check: confirms the environment can talk to Supabase.
 *
 *   npm run env:check
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];

function check(label, ok, detail) {
  results.push({ label, ok, detail });
}

check("NEXT_PUBLIC_SUPABASE_URL", Boolean(url), url ? url.replace(/\/\/.*@/, "//") : "missing");
check("NEXT_PUBLIC_SUPABASE_ANON_KEY", Boolean(anonKey), anonKey ? `…${anonKey.slice(-6)}` : "missing");
check(
  "SUPABASE_SERVICE_ROLE_KEY",
  Boolean(serviceKey),
  serviceKey ? `…${serviceKey.slice(-6)}` : "missing (only needed for admin scripts)"
);

if (url && anonKey) {
  try {
    const response = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    // 200 with an empty array is expected: RLS hides other members' rows.
    check("Supabase REST reachable", response.ok || response.status === 206, `HTTP ${response.status}`);
  } catch (error) {
    check("Supabase REST reachable", false, error instanceof Error ? error.message : "network error");
  }
}

for (const result of results) {
  console.log(`${result.ok ? "✅" : "✖ "} ${result.label} — ${result.detail}`);
}

const failed = results.filter((result) => !result.ok && !result.label.includes("SERVICE_ROLE"));
process.exit(failed.length === 0 ? 0 : 1);
