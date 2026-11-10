/**
 * Reading and diagnosing the Firebase service account.
 *
 * This file exists because of one specific evening: production returned
 * "Secure signup storage is unavailable" to a real member, every environment
 * variable in Vercel was present and freshly pasted, and nothing anywhere said
 * which way the key was wrong. The health endpoint said "misconfigured", which
 * is true and useless.
 *
 * There are several distinct ways the value can be unusable, and they need
 * different fixes by a human:
 *
 *   1. not set                      -> generate and paste a key
 *   2. not valid base64 or JSON     -> re-paste; the copy was truncated
 *   3. valid JSON, not an object    -> pasted the wrong file
 *   4. no project_id                -> a partial or hand-edited file
 *   5. no private_key               -> a partial or hand-edited file
 *   6. private_key is not a PEM     -> the newlines were mangled in transit
 *   7. no client_email              -> a partial or hand-edited file
 *
 * One function answers all of them, `inspect`, and it returns either a usable
 * account or the reason there is none. There is deliberately no second opinion:
 * an earlier draft had a parser and a separate diagnosis, and they disagreed on
 * a key that would load but could never sign. Two code paths that both claim to
 * know what a valid key is will eventually disagree, and the person reading the
 * screen gets whichever answer is wrong.
 *
 * Never logs or returns a secret. The diagnosis reports shapes and lengths.
 */

export type ServiceAccountProblem =
  | "ok"
  | "absent"
  | "not-base64"
  | "not-json"
  | "not-an-object"
  | "missing-project-id"
  | "missing-private-key"
  | "missing-client-email"
  | "private-key-not-pem";

export interface ServiceAccountShape {
  length: number;
  lookedBase64: boolean;
  decodedAsJson: boolean;
  projectId: string | null;
  /** "service_account" for a real key file. */
  type: string | null;
  keyLength: number;
}

export interface ServiceAccountInspection {
  /** The credential, when it is usable. Null otherwise. */
  account: Record<string, unknown> | null;
  problem: ServiceAccountProblem;
  /** One sentence, written for whoever pasted the value. */
  summary: string;
  /** The fix, in one step. */
  fix: string;
  /** Non-secret facts, useful when the summary is not enough. */
  shape: ServiceAccountShape;
}

export interface ServiceAccountDiagnosis extends Omit<ServiceAccountInspection, "account"> {
  /** The variable that supplied the value, when one did. */
  variable: string | null;
}

const VARIABLE_ORDER = [
  "FIREBASE_SERVICE_ACCOUNT_KEY",
  "SERVICE_ACCOUNT",
  "FIREBASE_SERVICE_ACCOUNT",
];

const BASE64 = /^[A-Za-z0-9+/=\s]+$/;

/** The first of the three accepted variable names that holds a value. */
export function serviceAccountVariable(
  env: Record<string, string | undefined> = process.env
): string | null {
  for (const name of VARIABLE_ORDER) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length > 0) return name;
  }
  return null;
}

/** The raw value from whichever accepted variable holds one. */
export function serviceAccountRaw(
  env: Record<string, string | undefined> = process.env
): string | null {
  const name = serviceAccountVariable(env);
  return name ? String(env[name]) : null;
}

function emptyShape(length = 0): ServiceAccountShape {
  return {
    length,
    lookedBase64: false,
    decodedAsJson: false,
    projectId: null,
    type: null,
    keyLength: 0,
  };
}

/**
 * The one answer: is this value a usable service account, and if not, why.
 *
 * Every consumer goes through here, so the credential that gets built and the
 * sentence that gets shown to a human cannot describe different things.
 */
export function inspect(raw: string | null | undefined): ServiceAccountInspection {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const shape = emptyShape(trimmed.length);

  if (!trimmed) {
    return {
      account: null,
      problem: "absent",
      summary: "No service account is set, so the server cannot read or write member records.",
      fix:
        "Firebase console -> Project settings -> Service accounts -> Generate new private key. Base64 the whole file and paste it as FIREBASE_SERVICE_ACCOUNT_KEY.",
      shape,
    };
  }

  /*
   * Base64 is the shape Vercel encourages, because a JSON file pasted into a
   * single-line field loses its newlines. Plain JSON is accepted too, because a
   * deployment that pasted the file directly should still work.
   */
  let json: unknown;
  if (trimmed.startsWith("{")) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      return {
        account: null,
        problem: "not-json",
        summary: "The value starts like JSON but does not parse.",
        fix:
          "The paste was truncated or a quote was lost. Base64 the entire key file and paste that single line instead.",
        shape,
      };
    }
  } else {
    shape.lookedBase64 = BASE64.test(trimmed);
    try {
      json = JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
      shape.decodedAsJson = true;
    } catch {
      return {
        account: null,
        problem: shape.lookedBase64 ? "not-json" : "not-base64",
        summary: shape.lookedBase64
          ? "The value decoded as base64 but the result is not JSON."
          : "The value is neither JSON nor base64. This is usually a truncated paste of the raw file.",
        fix:
          "Run `base64 -w0 serviceAccount.json` locally and paste that exact output as one line.",
        shape,
      };
    }
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return {
      account: null,
      problem: "not-an-object",
      summary: "The value decodes to something that is not a JSON object.",
      fix: "You pasted the wrong file. Use the private key JSON from Firebase.",
      shape,
    };
  }

  const account = { ...(json as Record<string, unknown>) };
  shape.type = typeof account.type === "string" ? account.type : null;
  shape.projectId = typeof account.project_id === "string" ? account.project_id : null;

  if (!shape.projectId) {
    return {
      account: null,
      problem: "missing-project-id",
      summary: "The value parses, but it has no project_id.",
      fix: "This is a partial or hand-edited file. Generate a fresh key rather than fixing this one.",
      shape,
    };
  }

  const key = typeof account.private_key === "string" ? account.private_key : "";
  shape.keyLength = key.length;

  if (!key) {
    return {
      account: null,
      problem: "missing-private-key",
      summary: "The value parses, but it has no private_key.",
      fix: "This is a partial or hand-edited file. Generate a fresh key rather than fixing this one.",
      shape,
    };
  }

  /*
   * Vercel stores whatever was typed. A JSON file pasted directly keeps the
   * literal two-character sequence \n, which is not a newline to the PEM reader
   * and makes every signature fail with an error naming neither field nor
   * cause. Undoing that here is the difference between working and not.
   *
   * This is a repair, not a check: the repaired value is what gets used, and it
   * is reported as healthy because it is.
   */
  if (typeof account.private_key === "string") {
    account.private_key = account.private_key.replace(/\\n/g, "\n");
  }

  const pem = String(account.private_key);
  if (!pem.includes("-----BEGIN PRIVATE KEY-----") || !pem.includes("-----END PRIVATE KEY-----")) {
    return {
      account: null,
      problem: "private-key-not-pem",
      summary: "The private_key is not a complete PEM block, so nothing can be signed with it.",
      fix:
        "The key lost its newlines or was cut short. Generate a fresh key and paste it base64-encoded.",
      shape,
    };
  }

  if (!account.client_email) {
    return {
      account: null,
      problem: "missing-client-email",
      summary: "The value has a key but no client_email, which the SDK needs to sign.",
      fix: "Generate a fresh key from the Firebase console.",
      shape,
    };
  }

  return {
    account,
    problem: "ok",
    summary: `A service account for ${shape.projectId}.`,
    fix: "Nothing to do.",
    shape,
  };
}

/**
 * Parse a service account from JSON, or from base64 of JSON.
 *
 * Returns null whenever `inspect` would report a problem, by construction.
 */
export function parseServiceAccount(raw: string): Record<string, unknown> | null {
  return inspect(raw).account;
}

/** Why `parseServiceAccount` would return null, in words a person can act on. */
export function diagnoseServiceAccount(
  env: Record<string, string | undefined> = process.env
): ServiceAccountDiagnosis {
  const variable = serviceAccountVariable(env);
  const result = inspect(variable ? String(env[variable]) : null);
  const { account: _account, ...rest } = result;
  return {
    ...rest,
    summary: variable ? `${variable}: ${rest.summary}` : rest.summary,
    variable,
  };
}
