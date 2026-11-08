import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server-auth";
import { UPLOAD_FOLDER } from "@/lib/file-kind";
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

    return parsed.pathname.startsWith(`/${cloud}/`) && parsed.pathname.includes(`/${UPLOAD_FOLDER}/`);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // An unbound anonymous caller must not use this endpoint as an OCR or
  // provider-quota oracle. Signup before account creation stays manual review.
  const actor = await authenticateRequest(request).catch(() => null);
  if (!actor) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      code: "verification-unavailable",
      message: "Sign-in is required for server screening. Signup remains pending manual review.",
      reasons: ["verification-unavailable"],
    }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const limits = await rateLimit(`kyc:verify:${actor.uid}`, 60, 3600);
  if (!limits.success) {
    return NextResponse.json(
      { ok: false, skipped: true, error: "Too many checks from this connection. Try again later." },
      { status: 429 }
    );
  }

  if (!ootoConfigured()) {
    // Missing credentials are not an identity verdict. Fail closed to manual review.
    return NextResponse.json({
      ok: false,
      skipped: true,
      configured: false,
      code: "verification-unavailable",
      message: "Automated identity verification is unavailable. This application requires manual review.",
      reasons: ["verification-unavailable"],
    }, { status: 503 });
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
      configured: true,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
