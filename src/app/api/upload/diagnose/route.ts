import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Storage self-test.
 *
 * Every upload failure until now arrived as a sentence with no evidence, and the
 * only way to tell "wrong secret" from "account restriction" from "server cannot
 * reach Cloudinary" was guesswork spread across app versions. This route uploads
 * one 1x1 PNG with the production signing code, on both endpoints members use,
 * and reports exactly what came back.
 *
 * It never returns a credential. Names, lengths and verdicts only.
 */

/** A real 1x1 transparent PNG. Small enough to be free, valid enough to be accepted. */
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const FOLDER = "rabis-kyc/diagnostics";

function sign(params: Record<string, string>, secret: string) {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto.createHash("sha1").update(`${toSign}${secret}`).digest("hex");
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Anything Cloudinary says when it does not trust the caller. */
const AUTH_FAILURE = /signature|api[_-]?key|api[_-]?secret|cloud[ _]name|unauthori[sz]ed|forbidden|disabled/i;

interface ProbeResult {
  endpoint: "image" | "video";
  /** True when Cloudinary accepted the credential, whatever it thought of the file. */
  authAccepted: boolean;
  httpStatus: number | null;
  message: string;
  secureUrl?: string;
}

/**
 * Post the same tiny PNG to one endpoint.
 *
 * For `video` the file is deliberately the wrong type: Cloudinary should reject
 * the *format*, which proves the signature and the account work on that endpoint
 * too. A signature error instead means video uploads are broken before the bytes
 * are even considered.
 */
async function probe(
  endpoint: "image" | "video",
  cloudName: string,
  apiKey: string,
  preset: string,
  secret: string
): Promise<ProbeResult> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = { folder: FOLDER, timestamp };

  const body = new FormData();
  const bytes = Buffer.from(TEST_PNG_BASE64, "base64");
  body.append("file", new Blob([bytes], { type: "image/png" }), "check.png");
  for (const [key, value] of Object.entries(params)) body.append(key, value);

  if (apiKey && secret) {
    body.append("api_key", apiKey);
    body.append("signature", sign(params, secret));
  } else {
    body.append("upload_preset", preset);
  }

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${endpoint}/upload`, {
      method: "POST",
      body,
    });

    const data = (await response.json().catch(() => ({}))) as {
      secure_url?: string;
      error?: { message?: string };
    };

    const message = data.error?.message || "";
    const accepted = Boolean(response.ok && data.secure_url);

    return {
      endpoint,
      // A rejected *format* still proves the credential was trusted.
      authAccepted: accepted || !AUTH_FAILURE.test(message),
      httpStatus: response.status,
      message: accepted ? "Accepted." : message || "No message returned.",
      secureUrl: data.secure_url,
    };
  } catch (error) {
    return {
      endpoint,
      authAccepted: false,
      httpStatus: null,
      message: `The server could not reach api.cloudinary.com: ${(error as Error).message}`,
    };
  }
}

export async function POST(request: Request) {
  const actor = await authenticateRequest(request);
  if (!actor) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!actor.email || !adminEmails().includes(actor.email.toLowerCase())) {
    return NextResponse.json({ error: "Owner account only" }, { status: 403 });
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || "";
  const apiKey = process.env.CLOUDINARY_API_KEY || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

  const config = {
    cloudName,
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret),
    hasUploadPreset: Boolean(preset),
    apiKeyLength: apiKey.length,
    apiSecretLength: apiSecret.length,
    signed: Boolean(apiKey && apiSecret),
  };

  if (!cloudName || (!config.signed && !preset)) {
    return NextResponse.json({
      ok: false,
      stage: "config",
      config,
      message: !cloudName
        ? "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is empty on this deployment."
        : "Neither an API key/secret pair nor an upload preset is present on this deployment.",
    });
  }

  const image = await probe("image", cloudName, apiKey, preset, apiSecret);
  const video = await probe("video", cloudName, apiKey, preset, apiSecret);

  const ok = image.authAccepted && video.authAccepted;

  return NextResponse.json({
    ok,
    stage: ok ? "upload" : "cloudinary",
    config,
    httpStatus: image.httpStatus,
    cloudinaryMessage: ok ? undefined : image.message,
    image,
    video,
    message: ok
      ? "Cloudinary accepted a signed photo, and the video endpoint trusts the same key. Storage is working."
      : image.authAccepted
      ? "Photos work, but the video endpoint refused the credential. Face clips will fall back to manual review."
      : "Cloudinary refused the signed upload. The exact reason is below.",
  });
}
