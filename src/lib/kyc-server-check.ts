/**
 * The browser side of `/api/kyc/verify`.
 *
 * The on-device model gives instant feedback, but it runs on the member's phone
 * and can be starved of memory or interfered with. This asks the server for a
 * second opinion on the file that was actually uploaded.
 *
 * A network failure is not a pass. It returns skipped plus ok=false so the
 * caller can keep signup available only through an explicit manual-review path.
 */

import { auth } from "@/lib/firebase";

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
  const actor = auth.currentUser;
  if (!actor) {
    return {
      ok: false,
      skipped: true,
      message: "Automated checks are unavailable before account creation. Rabi will review this application manually.",
      reasons: ["verification-unavailable"],
    };
  }
  const token = await actor.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("/api/kyc/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      // A skipped check is unknown, not a successful identity verification.
      ok: payload.ok === true && payload.skipped !== true,
      skipped: payload.skipped === true,
      message: payload.message,
      reasons: payload.reasons,
      score: payload.score,
      detail: payload.detail,
      configured: payload.configured,
    };
  } catch {
    return { ok: false, skipped: true, message: "Automated identity verification is unavailable. This application requires manual review.", reasons: ["verification-unavailable"] };
  } finally {
    clearTimeout(timer);
  }
}
