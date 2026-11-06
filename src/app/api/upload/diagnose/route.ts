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
 * reach Cloudinary" was guesswork across app versions. This route uploads one
 * 1x1 PNG with the production signing code and reports exactly what happened.
 *
 * It never returns a credential. Names and verdicts only.
 */

/** A real 1x1 transparent PNG. Small enough to be free, valid enough to be accepted. */
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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

  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = { folder: "rabis-kyc/diagnostics", timestamp };

  const body = new FormData();
  body.append("file", new Blob([Buffer.from(TEST_PNG_BASE64, "base64")], { type: "image/png" }), "check.png");
  for (const [key, value] of Object.entries(params)) body.append(key, value);

  if (config.signed) {
    body.append("api_key", apiKey);
    body.append("signature", sign(params, apiSecret));
  } else {
    body.append("upload_preset", preset);
  }

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body,
    });

    const data = (await response.json().catch(() => ({}))) as {
      secure_url?: string;
      error?: { message?: string; http_code?: number };
    };

    if (response.ok && data.secure_url) {
      return NextResponse.json({
        ok: true,
        stage: "upload",
        config,
        httpStatus: response.status,
        message: "Cloudinary accepted a signed test image. Storage is working.",
      });
    }

    return NextResponse.json({
      ok: false,
      stage: "cloudinary",
      config,
      httpStatus: response.status,
      cloudinaryMessage: data.error?.message || "No message returned.",
      message:
        apiKey.length === 0 || apiSecret.length === 0
          ? "Cloudinary has no API credentials to sign with."
          : "Cloudinary refused the upload. The exact reason is above.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: "network",
      config,
      message: `The server could not reach api.cloudinary.com: ${(error as Error).message}`,
    });
  }
}
