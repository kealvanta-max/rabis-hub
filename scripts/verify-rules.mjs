#!/usr/bin/env node
/**
 * Reads back the ruleset that is actually serving traffic.
 *
 * Deploying a file and trusting the CLI's "Deploy complete" leaves one question
 * open: is the release pointing at my new ruleset, or at the previous one? This
 * asks the Firebase Rules API for the active Firestore release, downloads its
 * source, and checks that the clauses from this round are present in it.
 *
 * Run locally:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/verify-rules.mjs
 * or:
 *   FIREBASE_SERVICE_ACCOUNT_KEY="$(cat service-account.json)" node scripts/verify-rules.mjs
 *
 * Exits non-zero when a clause is missing, so it works as a CI gate.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const PROJECT = process.env.FIREBASE_PROJECT_ID || "rabi-hub";
const RELEASE = `projects/${PROJECT}/releases/cloud.firestore`;
const TOKEN_URI = "https://oauth2.googleapis.com/token";

/** Clauses that must exist in the live rules for this round to be in effect. */
const REQUIRED = [
  // The identity freeze: KYC fields may only change while pending.
  "affectedKeys().hasAny([",
  "ghanaCardFront",
  "passportPhoto",
  // Create-time forgery guards.
  "!('adminAlertAt' in request.resource.data)",
  "!('decisionEmailAt' in request.resource.data)",
];

function serviceAccount() {
  const inline = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.SERVICE_ACCOUNT || "").trim();

  if (inline) {
    if (inline.startsWith("{")) return JSON.parse(inline);
    try {
      return JSON.parse(Buffer.from(inline, "base64").toString("utf8"));
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is neither JSON nor base64 JSON.");
    }
  }

  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) return JSON.parse(readFileSync(file, "utf8"));

  throw new Error(
    "No service account. Set FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS."
  );
}

const b64url = (value) => Buffer.from(value).toString("base64url");

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase",
    aud: sa.token_uri || TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify(claim)
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(sa.private_key);
  const assertion = `${unsigned}.${Buffer.from(signature).toString("base64url")}`;

  const response = await fetch(sa.token_uri || TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google refused the service account (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("No access token returned.");
  return data.access_token;
}

async function main() {
  const sa = serviceAccount();
  const token = await accessToken(sa);
  const auth = { Authorization: `Bearer ${token}` };

  const releaseResponse = await fetch(`https://firebaserules.googleapis.com/v1/${RELEASE}`, {
    headers: auth,
  });

  if (!releaseResponse.ok) {
    throw new Error(
      `Could not read the live release (${releaseResponse.status}): ${(await releaseResponse
        .text()
        .catch(() => ""))
        .slice(0, 300)}`
    );
  }

  const release = await releaseResponse.json();
  const rulesetName = release.rulesetName;

  if (!rulesetName) throw new Error("The live release has no ruleset attached.");

  const rulesetResponse = await fetch(`https://firebaserules.googleapis.com/v1/${rulesetName}`, {
    headers: auth,
  });

  if (!rulesetResponse.ok) {
    throw new Error(`Could not download the live ruleset (${rulesetResponse.status}).`);
  }

  const ruleset = await rulesetResponse.json();
  const content = (ruleset.source?.[0]?.files ?? []).map((file) => file.content ?? "").join("\n");

  console.log(`project:  ${PROJECT}`);
  console.log(`ruleset:  ${rulesetName}`);
  console.log(`updated:  ${release.updateTime || ruleset.createTime || "unknown"}`);
  console.log(`size:     ${content.length} characters`);

  const missing = REQUIRED.filter((needle) => !content.includes(needle));

  if (missing.length > 0) {
    console.error("");
    console.error("The live ruleset is NOT the current firestore.rules.");
    console.error("Missing clauses:");
    for (const clause of missing) console.error(`  - ${clause}`);
    process.exit(1);
  }

  console.log("");
  console.log("The live ruleset contains the identity freeze and the create-time guards.");
}

main().catch((error) => {
  console.error(`verify-rules failed: ${error.message}`);
  process.exit(1);
});
