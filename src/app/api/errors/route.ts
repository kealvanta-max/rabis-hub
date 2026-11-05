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

export async function POST(request: Request) {
  const limits = await rateLimit(clientKey(request, "errors"), 20, 60);
  if (!limits.success) return new NextResponse(null, { status: 429 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // Always log server-side so errors show in Vercel logs even without Sentry.
  console.error("[client-error]", String(body.message ?? ""), String(body.stack ?? ""));

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
      message: String(body.message ?? "Unknown client error").slice(0, 1000),
      transaction: typeof body.url === "string" ? body.url.slice(0, 400) : undefined,
      extra: {
        stack: typeof body.stack === "string" ? body.stack.slice(0, 8000) : undefined,
        context: body.context,
        userAgent: body.userAgent,
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
