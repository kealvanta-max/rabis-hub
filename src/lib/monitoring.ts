"use client";

/**
 * Lightweight error reporting.
 *
 * Instead of pulling the ~90 kB Sentry SDK into the client bundle, errors are
 * forwarded to `/api/errors`, which relays them to Sentry using the plain
 * envelope API. Any Sentry project works — just set `SENTRY_DSN` on the server.
 */

interface ErrorPayload {
  message: string;
  stack?: string;
  level?: "error" | "warning" | "info";
  context?: Record<string, unknown>;
  url?: string;
  userAgent?: string;
}

const reported = new Set<string>();

export function captureException(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const err = error instanceof Error ? error : new Error(String(error));
  const fingerprint = `${err.message}:${err.stack?.slice(0, 120) ?? ""}`;
  if (reported.has(fingerprint)) return; // don't spam the same failure
  reported.add(fingerprint);

  const payload: ErrorPayload = {
    message: err.message,
    stack: err.stack,
    level: "error",
    context,
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  try {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}

/** Catch the errors React error boundaries never see. */
export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent) =>
    captureException(event.error ?? event.message, { source: "window.onerror" });

  const onRejection = (event: PromiseRejectionEvent) =>
    captureException(event.reason, { source: "unhandledrejection" });

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
