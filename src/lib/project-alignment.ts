/**
 * Does the server write to the same Firestore the browser reads?
 *
 * The failure this exists for
 * --------------------------
 * A member finished signup, the account was created, and the dashboard said
 * "Your login works but your registration has not reached us". Nothing had
 * failed. Every write returned 200.
 *
 * The cause is two project ids that never meet:
 *
 *   - the Admin SDK authenticates with `FIREBASE_SERVICE_ACCOUNT_KEY` and
 *     writes to `credentials.project_id` from inside that key file
 *   - the browser app is configured with `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
 *
 * When those name different projects, `adminFirestore()` writes happily into
 * one database while `getDoc` in the browser reads the other, finds nothing, and
 * the member is told her application "has not reached us". It is invisible from
 * every direction:
 *
 *   - the write probe in `/api/health` passes, because it goes through the same
 *     Admin SDK and therefore the same (wrong) project
 *   - `criticalGaps()` passes, because both variables are present
 *   - the browser read succeeds, because the other project exists and is empty
 *
 * The only way to see it is to compare the two ids directly, which is what this
 * module does. It is pure and takes its inputs as arguments so the check itself
 * can be tested without a deployment.
 */

export interface ProjectAlignment {
  /**
   * - `aligned`     both ids are present and equal: the normal case
   * - `mismatch`    both are present and different: every save is invisible
   * - `unknown`     one side is absent or unparseable, so nothing can be said
   */
  state: "aligned" | "mismatch" | "unknown";
  /** The project the service account writes to, when it could be read. */
  serviceAccountProject: string | null;
  /** The project the browser is configured to read. */
  browserProject: string | null;
  /** One sentence, naming both ids when they differ. Never contains a secret. */
  summary: string;
  /** The exact change that fixes it, when there is one. */
  fix?: string;
}

/**
 * Compare the two project ids.
 *
 * Deliberately `unknown` rather than `mismatch` when either side is missing. A
 * deployment with no service account is broken for a *different* reason, which
 * `/api/health` already reports precisely, and reporting it here as a mismatch
 * would send someone editing the wrong variable.
 */
export function checkProjectAlignment(
  browserProjectRaw: string | null | undefined,
  serviceAccountProjectRaw: string | null | undefined
): ProjectAlignment {
  const browserProject = (browserProjectRaw ?? "").trim() || null;
  const serviceAccountProject = (serviceAccountProjectRaw ?? "").trim() || null;

  if (!browserProject || !serviceAccountProject) {
    return {
      state: "unknown",
      serviceAccountProject,
      browserProject,
      summary: !browserProject
        ? "NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set, so there is nothing to compare the service account against."
        : "The service account's project id could not be read, so there is nothing to compare it against.",
    };
  }

  if (browserProject === serviceAccountProject) {
    return {
      state: "aligned",
      serviceAccountProject,
      browserProject,
      summary: `Both the browser and the server are using the "${browserProject}" project.`,
    };
  }

  /*
   * The message names both projects, because the person reading it is looking at
   * two environment variables side by side and needs to know which one is which.
   * Neither value is a secret: a project id is visible in every Firebase URL.
   */
  return {
    state: "mismatch",
    serviceAccountProject,
    browserProject,
    summary:
      `The server writes to "${serviceAccountProject}" but the browser reads "${browserProject}". ` +
      "Every application is saved to a database nobody opens, which is why members are told their registration did not arrive.",
    fix:
      `Set NEXT_PUBLIC_FIREBASE_PROJECT_ID to "${serviceAccountProject}", or replace FIREBASE_SERVICE_ACCOUNT_KEY ` +
      `with a key downloaded from the "${browserProject}" project. The second is usually right if "${browserProject}" ` +
      "is where members already exist.",
  };
}

/**
 * The browser-facing project id, read the way Next.js exposes it.
 *
 * A separate function so the call sites do not each remember the exact variable
 * name, and so a typo is a compile error rather than a silent `undefined` that
 * makes this check report `unknown` forever.
 */
export function configuredBrowserProject(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECTID ?? "";
  return value.trim() || null;
}
