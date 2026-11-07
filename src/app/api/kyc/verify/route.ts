import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { checkCard, checkMatch, checkSelfie, checkVideo, ootoConfigured } from "@/lib/ooto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side KYC checks.
 *
 * The on-device model gives fast feedback, but it runs in the member's browser,
 * so a phone that refuses to load it decided the outcome. This route asks a
 * server instead, which is why a photo of a dog cannot get through by breaking
 * the local detector.
 *
 * It accepts the Cloudinary URL of a file the member just uploaded rather than
 * the file itself, so the browser never posts a second copy of a multi-megabyte
 * photo. Only our own Cloudinary host is accepted, which also stops anyone from
 * making the server fetch an arbitrary address.
 */
const KINDS = new Set(["selfie", "card", "video", "match"]);

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || "unknown";
}

/** Only files on our own Cloudinary account. Nothing else is fetched. */
function trustedUpload(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "res.cloudinary.com") return false;

    const cloud = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "").trim();
    if (!cloud) return false;

    return parsed.pathname.startsWith(`/${cloud}/`);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const limits = await rateLimit(`kyc:verify:${clientIp(request)}`, 60, 3600);
  if (!limits.success) {
    return NextResponse.json(
      { ok: false, skipped: true, error: "Too many checks from this connection. Try again later." },
      { status: 429 }
    );
  }

  if (!ootoConfigured()) {
    // No credentials: the caller keeps its on-device result. Never an error.
    return NextResponse.json({ ok: true, skipped: true, configured: false });
  }

  let body: { kind?: unknown; url?: unknown; selfieUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = typeof body.kind === "string" ? body.kind : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const selfieUrl = typeof body.selfieUrl === "string" ? body.selfieUrl.trim() : "";

  if (!KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "Unknown check" }, { status: 400 });
  }

  if (!url || !trustedUpload(url)) {
    return NextResponse.json({ ok: false, error: "Unknown upload" }, { status: 400 });
  }

  // Signups collect documents before the account exists, so a token is optional
  // here. When one is present it identifies the member in the log.
  const actor = await authenticateRequest(request).catch(() => null);

  let verdict;
  if (kind === "selfie") verdict = await checkSelfie(url);
  else if (kind === "card") verdict = await checkCard(url);
  else if (kind === "video") verdict = await checkVideo(url);
  else {
    if (!selfieUrl || !trustedUpload(selfieUrl)) {
      return NextResponse.json({ ok: false, error: "Unknown selfie" }, { status: 400 });
    }
    verdict = await checkMatch(url, selfieUrl);
  }

  if (!verdict.ok && verdict.reasons.length > 0) {
    console.info("[kyc] rejected", { kind, reasons: verdict.reasons, uid: actor?.uid ?? "anonymous" });
  }

  return NextResponse.json(
    {
      ok: verdict.ok,
      skipped: verdict.skipped,
      check: verdict.check,
      message: verdict.message,
      reasons: verdict.reasons,
      score: verdict.score,
      detail: verdict.detail,
      configured: true,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
