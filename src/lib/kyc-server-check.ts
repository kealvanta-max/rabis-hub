/**
 * The browser side of `/api/kyc/verify`.
 *
 * The on-device model gives instant feedback, but it runs on the member's phone
 * and can be starved of memory or interfered with. This asks the server for a
 * second opinion on the file that was actually uploaded.
 *
 * A network failure returns `skipped`, never `ok: false`. Punishing a member for
 * our outage would be worse than the risk of the check not running, and the
 * server-side result is recorded for Rabi either way.
 */

export interface ServerCheck {
  ok: boolean;
  skipped: boolean;
  message?: string;
  reasons?: string[];
  score?: number;
  detail?: Record<string, unknown>;
  configured?: boolean;
}

const TIMEOUT_MS = 30_000;

export async function serverKycCheck(
  kind: "selfie" | "card" | "video" | "match",
  url: string,
  selfieUrl?: string
): Promise<ServerCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("/api/kyc/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, url, ...(selfieUrl ? { selfieUrl } : {}) }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as ServerCheck;

    if (!response.ok && !payload.skipped) {
      return {
        ok: false,
        skipped: false,
        message: payload.message || "That file could not be verified. Take it again.",
        reasons: payload.reasons ?? ["server-error"],
      };
    }

    return {
      ok: payload.ok !== false,
      skipped: payload.skipped === true,
      message: payload.message,
      reasons: payload.reasons,
      score: payload.score,
      detail: payload.detail,
      configured: payload.configured,
    };
  } catch {
    return { ok: true, skipped: true };
  } finally {
    clearTimeout(timer);
  }
}
