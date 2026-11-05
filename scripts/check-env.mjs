#!/usr/bin/env node
/**
 * Verify that every environment variable the app expects is present and shaped
 * correctly — before a deploy, not after a member hits a broken button.
 *
 *   npm run check:env              # checks .env.local, then process.env
 *   npm run check:env -- --file .env.production
 *   npm run check:env -- --strict  # exit 1 on missing OPTIONAL keys too
 *
 * Prints names and verdicts only; never values.
 */
import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const fileArg = args.indexOf("--file");
const file = fileArg >= 0 ? args[fileArg + 1] : ".env.local";
const strict = args.includes("--strict");

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
const env = { ...process.env, ...fromFile };

const has = (k) => typeof env[k] === "string" && env[k].trim().length > 0;

/** name → { required, test, hint } */
const RULES = {
  NEXT_PUBLIC_FIREBASE_API_KEY: { required: true, test: (v) => v.startsWith("AIza"), hint: "starts with AIza" },
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: { required: true, test: (v) => v.includes("."), hint: "project.firebaseapp.com" },
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: { required: true, test: () => true },
  NEXT_PUBLIC_FIREBASE_APP_ID: { required: true, test: (v) => v.includes(":"), hint: "1:123:web:abc" },
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: { required: true, test: (v) => /^[a-z0-9_-]+$/i.test(v) },
  CLOUDINARY_API_KEY: { required: true, test: (v) => /^\d{6,}$/.test(v), hint: "numeric" },
  CLOUDINARY_API_SECRET: { required: true, test: (v) => v.length >= 20 },
  FIREBASE_SERVICE_ACCOUNT_KEY: {
    required: false,
    hint: "service-account JSON (single line) or base64 JSON",
    // Parse it for real: a truncated paste is the classic failure.
    test: (v) => {
      try {
        const json = v.trim().startsWith("{")
          ? JSON.parse(v)
          : JSON.parse(Buffer.from(v, "base64").toString("utf8"));
        return Boolean(json.project_id && json.private_key && json.client_email);
      } catch {
        return false;
      }
    },
  },
  RESEND_API_KEY: { required: false, test: (v) => v.startsWith("re_"), hint: "starts with re_" },
  EMAIL_FROM: { required: false, test: (v) => v.includes("@") },
  UPSTASH_REDIS_REST_URL: { required: false, test: (v) => v.startsWith("https://") },
  UPSTASH_REDIS_REST_TOKEN: { required: false, test: (v) => v.length > 20 },
  NEXT_PUBLIC_POSTHOG_KEY: { required: false, test: (v) => v.startsWith("phc_"), hint: "starts with phc_" },
  NEXT_PUBLIC_POSTHOG_HOST: { required: false, test: (v) => v.startsWith("https://") },
  SENTRY_DSN: { required: false, test: (v) => /^https:\/\/[0-9a-f]+@/.test(v), hint: "https://<key>@o0.ingest.sentry.io/1" },
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: { required: false, test: (v) => v.startsWith("pk_"), hint: "starts with pk_test_ or pk_live_" },
  CLERK_SECRET_KEY: { required: false, test: (v) => v.startsWith("sk_"), hint: "starts with sk_test_ or sk_live_" },
  CLERK_JWT_ISSUER_DOMAIN: { required: false, test: (v) => v.startsWith("https://"), hint: "https://your-app.clerk.accounts.dev" },
  NEXT_PUBLIC_SITE_URL: { required: false, test: (v) => v.startsWith("https://") },
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: { required: false, test: (v) => v.length > 10 },
};

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", OFF = "\x1b[0m";
let errors = 0;
let warnings = 0;

console.log(`\nChecking ${existsSync(file) ? file : "(no file — process.env only)"}\n`);

for (const [name, rule] of Object.entries(RULES)) {
  const value = env[name];
  if (!has(name)) {
    if (rule.required) {
      console.log(`${RED}✗ MISSING${OFF}   ${name} ${DIM}(required)${OFF}`);
      errors++;
    } else if (strict) {
      console.log(`${YELLOW}○ unset${OFF}     ${name} ${DIM}(optional)${OFF}`);
      warnings++;
    } else {
      console.log(`${YELLOW}○ unset${OFF}     ${name} ${DIM}(optional — feature degrades gracefully)${OFF}`);
    }
    continue;
  }
  if (!rule.test(value)) {
    console.log(`${RED}✗ BAD SHAPE${OFF} ${name} ${DIM}— expected ${rule.hint ?? "a different format"}${OFF}`);
    errors++;
    continue;
  }
  console.log(`${GREEN}✓${OFF}           ${name}`);
}

console.log(
  `\n${errors === 0 ? `${GREEN}OK${OFF}` : `${RED}FAILED${OFF}`} — ${errors} error(s), ${warnings} strict warning(s)\n`
);
process.exit(errors > 0 ? 1 : 0);
