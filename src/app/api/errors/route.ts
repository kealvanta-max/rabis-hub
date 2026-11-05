import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal Sentry envelope sender — no SDK, no bundle cost. */
function parseDsn(dsn: string) {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace("/", "");
    const publicKey = url.username;
    return { endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`, publicKey };
  } catch {
    return null;
  }
}

const uuid = () => crypto.randomUUID().replace(/-/g, "");

/** Errors are terse by nature; anything bigger is an attempt to flood the pipe. */
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const limits = await rateLimit(clientKey(request, "errors"), 20, 60);
  if (!limits.success) return new NextResponse(null, { status: 429 });

  // Cheap body cap before we parse: never let a stranger post megabytes here.
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const scrub = (value: string) =>
    value
      // e-mail addresses, phone numbers and bearer tokens never go to a third party
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
      .replace(/\+?\d[\d\s-]{7,}\d/g, "[phone]")
      .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, "[token]")
      .slice(0, 8000);

  const message = scrub(String(body.message ?? "Unknown client error"));
  const stack = typeof body.stack === "string" ? scrub(body.stack) : undefined;

  // Always log server-side so errors show in Vercel logs even without Sentry.
  console.error("[client-error]", message, stack ?? "");

  const dsn = process.env.SENTRY_DSN;
  const parsed = dsn ? parseDsn(dsn) : null;
  if (!parsed) return new NextResponse(null, { status: 204 });

  const eventId = uuid();
  const sentAt = new Date().toISOString();

  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      event_id: eventId,
      timestamp: sentAt,
      platform: "javascript",
      level: String(body.level ?? "error"),
      logger: "rabis-hub.client",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      message: message.slice(0, 1000),
      transaction: typeof body.url === "string" ? body.url.slice(0, 400) : undefined,
      extra: {
        stack,
        // Free-form context is capped so a stranger cannot park data in Sentry.
        context:
          body.context && typeof body.context === "object"
            ? JSON.stringify(body.context).slice(0, 2000)
            : undefined,
        userAgent: typeof body.userAgent === "string" ? body.userAgent.slice(0, 300) : undefined,
      },
    }),
  ].join("\n");

  try {
    await fetch(parsed.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=rabis-hub/1.0, sentry_key=${parsed.publicKey}`,
      },
      body: envelope,
    });
  } catch (error) {
    console.warn("Sentry relay failed:", (error as Error).message);
  }

  return new NextResponse(null, { status: 204 });
}
