/**
 * Lazily-initialised Firebase Admin, used only where a *service account* is
 * genuinely required: granting the `admin` custom claim and minting a Firebase
 * token for a Clerk session (see docs/CLERK_MIGRATION.md).
 *
 * Member traffic never touches this — `/api/email` and `/api/upload` verify ID
 * tokens through Identity Toolkit with the public web API key, which keeps the
 * service-account key out of the request path entirely.
 */

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

export class AdminNotConfiguredError extends Error {
  constructor() {
    super("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
    this.name = "AdminNotConfiguredError";
  }
}

function parseServiceAccount(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();

  // Accept raw JSON, base64 JSON (handy for paste-hostile dashboards) or a
  // single-line JSON with escaped newlines in `private_key`.
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);

  try {
    return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is neither JSON nor base64 JSON");
  }
}

let cached: Auth | null = null;

export function isAdminConfigured(): boolean {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  return typeof raw === "string" && raw.trim().length > 0;
}

export function adminAuth(): Auth {
  if (cached) return cached;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new AdminNotConfiguredError();

  const credentials = parseServiceAccount(raw);
  const app: App =
    getApps().find((candidate) => candidate.name === "rabis-admin") ??
    initializeApp({ credential: cert(credentials as Parameters<typeof cert>[0]) }, "rabis-admin");

  cached = getAuth(app);
  return cached;
}

/** Test seam. */
export function resetAdminAuth() {
  cached = null;
}
