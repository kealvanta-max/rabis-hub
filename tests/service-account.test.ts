import { describe, expect, it } from "vitest";

import {
  diagnoseServiceAccount,
  parseServiceAccount,
  serviceAccountVariable,
} from "@/lib/service-account";

/*
 * These are the six ways the production key was or could have been wrong.
 *
 * Each one produced the same two sentences for a member ("Secure signup storage
 * is unavailable") and the same one sentence in the log ("service account is
 * set but could not be parsed"). The point of this file is that each now has its
 * own name and its own fix, and that the parser and the diagnosis agree, since
 * the whole class of bug came from them being two separate pieces of logic.
 */

const PEM = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----\n";

function account(overrides: Record<string, unknown> = {}) {
  return {
    type: "service_account",
    project_id: "rabis-hub",
    private_key: PEM,
    client_email: "admin@rabis-hub.iam.gserviceaccount.com",
    ...overrides,
  };
}

const asBase64 = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64");

describe("service account parsing", () => {
  it("accepts base64 of a full key file", () => {
    const parsed = parseServiceAccount(asBase64(account()));
    expect(parsed?.project_id).toBe("rabis-hub");
  });

  it("accepts plain JSON, because pasting the file is a reasonable thing to do", () => {
    expect(parseServiceAccount(JSON.stringify(account()))?.project_id).toBe("rabis-hub");
  });

  it("turns escaped newlines back into real ones", () => {
    /*
     * Vercel keeps the two-character sequence. Without this step the PEM header
     * is never recognised and every signature fails with an error that names
     * neither the field nor the cause.
     */
    const escaped = account({ private_key: PEM.replace(/\n/g, "\\n") });
    const parsed = parseServiceAccount(JSON.stringify(escaped));
    expect(parsed?.private_key).toContain("\n");
    expect(parsed?.private_key).not.toContain("\\n");
  });

  it("refuses an object with no private key", () => {
    expect(parseServiceAccount(asBase64(account({ private_key: undefined })))).toBeNull();
  });
});

describe("service account diagnosis", () => {
  it("names an absent key", () => {
    const diagnosis = diagnoseServiceAccount({});
    expect(diagnosis.problem).toBe("absent");
    expect(diagnosis.fix).toContain("FIREBASE_SERVICE_ACCOUNT_KEY");
  });

  it("names a value that is neither JSON nor base64", () => {
    /*
     * A truncated paste of the raw file: real JSON begins with "{" and base64 is
     * a restricted alphabet, so a fragment of neither is caught exactly here.
     */
    const diagnosis = diagnoseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT_KEY: '{"type":"service_account","project_id":"ra',
    });
    expect(diagnosis.problem).toBe("not-json");
  });

  it("names a value that was never base64", () => {
    const diagnosis = diagnoseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT_KEY: "not base64 at all!",
    });
    expect(diagnosis.problem).toBe("not-base64");
  });

  it("names a paste of the wrong file", () => {
    const diagnosis = diagnoseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(["a", "list"]),
    });
    expect(diagnosis.problem).toBe("not-an-object");
  });

  it("names a partial file with no project_id", () => {
    const diagnosis = diagnoseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(account({ project_id: undefined })),
    });
    expect(diagnosis.problem).toBe("missing-project-id");
  });

  it("names a partial file with no private_key", () => {
    const diagnosis = diagnoseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(account({ private_key: undefined })),
    });
    expect(diagnosis.problem).toBe("missing-private-key");
  });

  it("names a private key that is not a PEM block", () => {
    const diagnosis = diagnoseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(
        account({ private_key: "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC" })
      ),
    });
    expect(diagnosis.problem).toBe("private-key-not-pem");
  });

  it("names a key with no client_email", () => {
    const diagnosis = diagnoseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(account({ client_email: undefined })),
    });
    expect(diagnosis.problem).toBe("missing-client-email");
  });

  it("passes a healthy key and reports the project", () => {
    const diagnosis = diagnoseServiceAccount({
      FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(account()),
    });
    expect(diagnosis.problem).toBe("ok");
    expect(diagnosis.shape.projectId).toBe("rabis-hub");
    expect(diagnosis.shape.type).toBe("service_account");
  });

  it("agrees with the parser on every shape it is given", () => {
    /*
     * The bug this file is about was the diagnosis and the real code path
     * disagreeing. If a value parses, the diagnosis must say ok, and the
     * reverse. Anything else is a lie told to whoever is fixing the deployment.
     */
    const samples: Array<Record<string, string>> = [
      {},
      { FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(account()) },
      { FIREBASE_SERVICE_ACCOUNT_KEY: JSON.stringify(account()) },
      { FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(account({ project_id: undefined })) },
      { FIREBASE_SERVICE_ACCOUNT_KEY: asBase64(account({ private_key: "nope" })) },
      { FIREBASE_SERVICE_ACCOUNT_KEY: "garbage!!" },
      { FIREBASE_SERVICE_ACCOUNT_KEY: "   " },
    ];

    for (const env of samples) {
      const raw = serviceAccountVariable(env) ? env.FIREBASE_SERVICE_ACCOUNT_KEY : null;
      const parses = raw ? parseServiceAccount(raw) !== null : false;
      const diagnosis = diagnoseServiceAccount(env);
      expect(diagnosis.problem === "ok").toBe(parses);
    }
  });
});
