/**
 * Single source of truth for every third-party integration.
 *
 * Why this exists: "did I paste the key into Vercel?" is the #1 reason a deploy
 * looks fine and then fails in front of a real member. This module knows which
 * environment variables each provider needs, whether the set is complete, and —
 * critically — what silently breaks when it is not. It never reads, returns or
 * logs a secret value, only presence and shape.
 *
 * Used by `/api/health`, `npm run check:env` and the docs.
 */

import { GOOGLE_SITE_VERIFICATION } from "@/lib/site";

export type IntegrationCategory =
  | "auth"
  | "media"
  | "email"
  | "data"
  | "analytics"
  | "errors"
  | "seo";

export interface IntegrationSpec {
  id: string;
  label: string;
  category: IntegrationCategory;
  /** Every name in this list must be non-empty for the integration to work. */
  required?: string[];
  /** Any one complete group is enough (provider fallbacks). */
  anyOf?: string[][];
  /** Exposed to the browser by design — never a secret. */
  publicKeys?: string[];
  /**
   * Values committed in the source tree. A variable listed here counts as
   * configured even when the deployment's environment holds nothing, because the
   * value ships with the build. Never put a secret here.
   */
  defaults?: Record<string, string>;
  /** What actually breaks for a member when this is missing. */
  impact: string;
  /** Where a human gets the value. */
  source: string;
}

export const INTEGRATIONS: IntegrationSpec[] = [
  {
    id: "firebase",
    label: "Firebase (auth + database)",
    category: "auth",
    required: [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
    ],
    publicKeys: [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    ],
    impact: "Nobody can sign up, sign in or load their dashboard. The whole app.",
    source: "Firebase console → Project settings → Your apps → Web app config",
  },
  {
    id: "firebase-admin",
    label: "Firebase Admin SDK (owner claim setup)",
    category: "auth",
    required: ["FIREBASE_SERVICE_ACCOUNT_KEY"],
    impact:
      "`npm run admin:setup` cannot grant the admin claim, so owner powers fall back to the verified email check.",
    source: "Firebase console → Project settings → Service accounts → Generate new private key",
  },
  {
    id: "cloudinary",
    label: "Cloudinary (KYC images)",
    category: "media",
    required: ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
    publicKeys: ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"],
    impact:
      "KYC uploads fail closed. Signup still works, but nobody can submit a Ghana Card, so nobody gets approved.",
    source: "Cloudinary dashboard → Dashboard → Product environment credentials",
  },
  {
    id: "resend",
    label: "Resend (transactional email)",
    category: "email",
    // Fallback chain mirrors the route: Resend → Gmail SMTP → Brevo SMTP.
    anyOf: [["RESEND_API_KEY", "EMAIL_FROM"], ["EMAIL_PASSWORD"], ["BACKUP_EMAIL_PASSWORD"]],
    impact:
      "No approval or rejection email reaches a member. MAIL_MODE=log prints mail to the server console instead of sending, so the routes stay exercised until the sending domain is verified. Gmail or Brevo SMTP can send if Resend is unset.",
    source: "resend.com → API Keys",
  },
  {
    id: "upstash",
    label: "Upstash Redis (distributed rate limiting)",
    category: "data",
    required: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    impact:
      "Rate limits fall back to per-instance memory: correct on one server, leaky across Vercel's many lambdas.",
    source: "console.upstash.com → your database → REST API",
  },
  {
    id: "posthog",
    label: "PostHog (product analytics)",
    category: "analytics",
    required: ["NEXT_PUBLIC_POSTHOG_KEY"],
    publicKeys: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
    impact:
      "No funnels, no session replay, Rabi cannot see what members actually do. Nothing else changes.",
    source: "posthog.com → Project settings → Project API key",
  },
  {
    id: "sentry",
    label: "Sentry (error tracking)",
    category: "errors",
    required: ["SENTRY_DSN"],
    impact: "Errors are logged to Vercel only. Nobody is alerted when signup breaks.",
    source: "sentry.io → Project → Settings → Client Keys (DSN)",
  },
  {
    id: "search-console",
    label: "Google Search Console (SEO)",
    category: "seo",
    required: ["NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION"],
    publicKeys: ["NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION"],
    // The token is committed in `src/lib/site.ts` on purpose, so every
    // deployment of this repo carries it. Reporting it "missing" just because a
    // dashboard field is empty would send Rabi chasing a problem she does not
    // have.
    defaults: { NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: GOOGLE_SITE_VERIFICATION },
    impact: "The site is not verified with Google, so indexing cannot be requested or monitored.",
    source: "search.google.com/search-console → URL prefix → HTML tag",
  },
];

export interface IntegrationStatus {
  id: string;
  label: string;
  category: IntegrationCategory;
  configured: boolean;
  /** Variable *names* that are still empty. Never values. */
  missing: string[];
  impact: string;
}

function present(env: Record<string, string | undefined>, name: string): boolean {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0;
}

/** Evaluate one spec against an environment map (defaults to `process.env`). */
export function evaluate(
  spec: IntegrationSpec,
  env: Record<string, string | undefined> = process.env
): IntegrationStatus {
  const missing: string[] = [];
  const defaults = spec.defaults ?? {};
  const available = (name: string): boolean => present(env, name) || present(defaults, name);

  for (const name of spec.required ?? []) {
    if (!available(name)) missing.push(name);
  }

  // `anyOf` groups model provider fallbacks: the integration still works if one
  // whole group is satisfied (e.g. Resend OR Gmail OR Brevo).
  let anyGroupSatisfied = !spec.anyOf || spec.anyOf.length === 0;
  if (spec.anyOf && spec.anyOf.length > 0) {
    anyGroupSatisfied = spec.anyOf.some((group) => group.every((name) => available(name)));
  }

  return {
    id: spec.id,
    label: spec.label,
    category: spec.category,
    configured: missing.length === 0 && anyGroupSatisfied,
    missing,
    impact: spec.impact,
  };
}

export function integrationStatus(
  env: Record<string, string | undefined> = process.env
): IntegrationStatus[] {
  return INTEGRATIONS.map((spec) => evaluate(spec, env));
}

/** Everything that must be set before the site can serve real members. */
export function criticalGaps(env: Record<string, string | undefined> = process.env): string[] {
  return integrationStatus(env)
    .filter((s) => !s.configured && (s.id === "firebase" || s.id === "cloudinary"))
    .flatMap((s) => s.missing.map((name) => `${s.id}: ${name}`));
}
