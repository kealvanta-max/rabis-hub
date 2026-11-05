import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // Vercel's own request cap is 4.5 MB.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const FOLDER = "rabis-kyc";

/**
 * Cloudinary signature: every parameter that is sent to Cloudinary (except
 * `file`, `api_key` and `resource_type`) is sorted, joined as `k=v&…` and
 * SHA-1 hashed with the API secret.
 */
function sign(params: Record<string, string>, secret: string) {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto.createHash("sha1").update(`${toSign}${secret}`).digest("hex");
}

export async function POST(request: Request) {
  const actor = await authenticateRequest(request);
  if (!actor) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const limit = await rateLimit(`upload:${actor.uid}`, 30, 300);
  if (!limit.success) {
    return NextResponse.json({ error: "Too many uploads. Please wait a moment." }, { status: 429 });
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName) {
    console.error("[upload] NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is missing.");
    return NextResponse.json({ error: "Uploads are not configured yet. Please contact support." }, { status: 503 });
  }

  /*
   * Signed mode needs the API key + secret and is the default. If an operator has
   * not added the secret yet, we still refuse to let the *browser* post to
   * Cloudinary — the upload is proxied here (so it stays authenticated) using the
   * configured preset. That keeps signup working without re-opening public writes.
   */
  const signed = Boolean(apiKey && apiSecret);
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!signed && !preset) {
    console.error("[upload] Cloudinary signing is not configured (API key/secret or preset missing).");
    return NextResponse.json({ error: "Uploads are not configured yet. Please contact support." }, { status: 503 });
  }

  let file: FormDataEntryValue | null = null;
  try {
    const formData = await request.formData();
    file = formData.get("file");
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received" }, { status: 400 });
  }

  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (8 MB maximum)." }, { status: 413 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPG, PNG or WEBP photos are accepted." }, { status: 415 });
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = {
    folder: FOLDER,
    // Incoming transformation hard-caps what can be stored: a 4000px original
    // is re-encoded to a 1600px, quality-80 asset before Cloudinary keeps it.
    transformation: "c_limit,w_1600,q_80",
    timestamp,
  };

  const body = new FormData();
  body.append("file", file);
  body.append("timestamp", timestamp);
  body.append("folder", params.folder);
  body.append("transformation", params.transformation);

  if (signed) {
    body.append("api_key", apiKey as string);
    body.append("signature", sign(params, apiSecret as string));
  } else {
    body.append("upload_preset", preset as string);
    console.warn("[upload] Signed uploads are off (no CLOUDINARY_API_SECRET); using the proxied preset path.");
  }

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body,
    });

    const data = (await response.json()) as { secure_url?: string; error?: { message?: string } };

    if (!response.ok || !data.secure_url) {
      console.error("[upload] Cloudinary rejected the upload:", data.error?.message);
      return NextResponse.json({ error: "Upload failed. Please try a smaller photo." }, { status: 502 });
    }

    return NextResponse.json({ secure_url: data.secure_url });
  } catch (error) {
    console.error("[upload] Cloudinary request failed:", (error as Error).message);
    return NextResponse.json({ error: "Upload failed. Check your connection and try again." }, { status: 502 });
  }
}
