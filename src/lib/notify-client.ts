/**
 * The browser side of the notification routes.
 *
 * This replaces an old `notifications.ts` that fired templates straight from the
 * admin's tab and returned `null` on every failure, so nobody could tell an
 * approved member who was never told. Two rules here:
 *
 * 1. the caller always gets an outcome object, never a silent null;
 * 2. nothing throws. A failed email must not fail an approval or a signup, it
 *    just has to be visible.
 *
 * The server decides who receives the mail, what it says and whether it worked.
 * Nothing in this file builds an email.
 */

export type NotifyMode = "log" | "live";

export interface NotifyOutcome {
  ok: boolean;
  /** "already-sent", "already-alerted" or "not-pending" when nothing was sent. */
  skipped?: string;
  mode?: NotifyMode;
  provider?: string;
  emailStatus?: "sent" | "logged" | "failed";
  recorded?: boolean;
  recipients?: number;
  member?: { name?: string; email?: string; status?: string };
  warning?: string;
  error?: string;
}

const TIMEOUT_MS = 12_000;

async function idToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

async function post(
  path: string,
  body: Record<string, unknown>,
  options: { keepalive?: boolean } = {}
): Promise<NotifyOutcome> {
  const token = await idToken();
  if (!token) {
    return { ok: false, error: "You are signed out, so no email was requested." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
      ...(options.keepalive ? { keepalive: true } : {}),
    });

    const payload = (await response.json().catch(() => ({}))) as NotifyOutcome;

    if (!response.ok) {
      const error = payload?.error || `Email request failed (${response.status})`;
      console.warn("[notify] request failed", { path, status: response.status, error });
      return { ...payload, ok: false, error };
    }

    return { ...payload, ok: payload?.ok !== false };
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? "The email request timed out."
        : (error as Error).message || "The email request failed.";
    console.warn("[notify] request error", { path, message });
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Approval or rejection mail for one member. Admin only, enforced on the server. */
export function requestDecisionEmail(
  uid: string,
  decision: "approved" | "rejected",
  reason?: string,
  force = false
): Promise<NotifyOutcome> {
  return post("/api/notify/decision", { uid, decision, reason, force });
}

/**
 * "Somebody applied" alert.
 *
 * With no argument it alerts Rabi about the signed-in member, which is the
 * signup path. With a uid it is the admin sweep picking up an alert that was
 * lost when a member closed their tab.
 */
export function requestNewMemberAlert(
  uid?: string,
  options: { force?: boolean; keepalive?: boolean } = {}
): Promise<NotifyOutcome> {
  return post(
    "/api/notify/new-member",
    { ...(uid ? { uid } : {}), ...(options.force ? { force: true } : {}) },
    { keepalive: options.keepalive }
  );
}

/** Human sentence for a toast. Log mode is normal until the domain is verified. */
export function describeOutcome(outcome: NotifyOutcome, noun = "email"): string {
  if (outcome.skipped === "already-sent") return "This member was already emailed about this decision.";
  if (outcome.skipped === "already-alerted") return "Rabi was already alerted about this application.";
  if (outcome.skipped === "not-pending") return "No alert needed, this application is already decided.";

  if (!outcome.ok) return `The ${noun} could not be sent: ${outcome.error || "unknown error"}`;

  if (outcome.mode === "log") return `The ${noun} was written to the server log. Sending starts once the domain is verified.`;
  if (outcome.provider === "console") return `The ${noun} was written to the server log.`;

  return `The ${noun} was sent via ${outcome.provider || "email"}.`;
}
