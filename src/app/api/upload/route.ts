import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/server-auth";
import {
  explainCloudinaryError,
  kindFromMime,
  MAX_UPLOAD_BYTES,
  sniffFileKind,
  UPLOAD_FOLDER,
  type FileKind,
} from "@/lib/file-kind";
import { kycVisionConfigured, screenSelfie } from "@/lib/kyc-vision";
import { rejectionMessage, type ScreeningState } from "@/lib/kyc-vision-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Remove a rejected file from Cloudinary.
 *
 * A refused selfie must not linger in storage: it is either not a person or it
 * is somebody else's face, and neither belongs in a KYC bucket. Deletion is
 * best effort, because the response to the member must not depend on it, and a
 * failed delete leaves an orphan the admin panel can still see.
 */
async function destroyCloudinaryAsset(url: string, kind: FileKind) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return;

  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return;
  const publicId = match[1].replace(/\.[a-z0-9]+$/i, "");

  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const params: Record<string, string> = { public_id: publicId, timestamp };
    const body = new FormData();
    for (const [key, value] of Object.entries(params)) body.append(key, value);
    body.append("api_key", apiKey);
    body.append("signature", sign(params, apiSecret));
    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${kind === "video" ? "video" : "image"}/destroy`, {
      method: "POST",
      body,
      cache: "no-store",
    });
  } catch {
    console.warn("[upload] could not delete a rejected file from storage");
  }
}

export async function POST(request: Request) {
  /*
   * Signup uploads happen BEFORE the account exists: a new member photographs
   * their Ghana Card on step three and only gets a Firebase user when they press
   * finish. Requiring a token here made every KYC photo fail on the real signup
   * flow, so anonymous uploads are allowed and paid for with a much tighter
   * rate limit per address, byte sniffing, and a hard size cap.
   */
  const actor = await authenticateRequest(request);

  /*
   * The budget is a burst guard, not a daily allowance.
   *
   * Three wrong answers in a row cost the owner two evenings:
   *
   * 1. Counted the IP address, so one tower's strangers shared a bucket.
   * 2. Counted the device over an hour, so a member testing her own signup a
   *    dozen times was locked out for the rest of the hour with the true error
   *    hidden behind a rate limit message.
   * 3. The client now retries a dropped upload up to three times, and every one
   *    of those attempts spent a slot. Fifteen taps became forty-five uploads.
   *
   * A minute-long window fixes all three. A person cannot tap through forty
   * uploads in a minute, retries drain in seconds instead of an hour, and the
   * counters start empty because the keys are new.
   *
   * The limits only ever exist to stop a script from spending the Cloudinary
   * quota. They are set far above anything a human can reach.
   */
  const device = (request.headers.get("x-rabis-device") || "").trim().slice(0, 64);

  const budgets: RateLimitResult[] = [];
  if (actor) {
    // A member in the dashboard: same person, same short window.
    budgets.push(await rateLimit(`upload:v2:uid:${actor.uid}`, 60, 60));
  } else {
    // 60 a minute on the phone. A whole signup is four; every rescued upload is
    // three. Nobody taps twenty times in a minute on purpose.
    if (device) budgets.push(await rateLimit(`upload:v2:dev:${device}`, 60, 60));
    // Backstop for a script minting fresh device ids from one tower.
    budgets.push(await rateLimit(`upload:v2:ip:${clientIp(request)}`, 600, 60));
  }

  const exhausted = budgets.find((entry) => !entry.success);

  if (exhausted) {
    const retryAfter = Math.max(1, Math.ceil((exhausted.resetAt - Date.now()) / 1000));

    return NextResponse.json(
      {
        message:
          "That was a lot of tries at once. Wait a few seconds and tap again.",
        error:
          "That was a lot of tries at once. Wait a few seconds and tap again, or send your documents to Rabi on WhatsApp.",
        code: "rate-limited",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName) {
    console.error("[upload] NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is missing.");
    return NextResponse.json(
      { error: "Uploads are not configured yet. Please contact support.", code: "no-cloud-name" },
      { status: 503 }
    );
  }

  /*
   * Signed mode needs the API key + secret and is the default. If an operator has
   * not added the secret yet, we still refuse to let the *browser* post to
   * Cloudinary: the upload is proxied here using the configured preset.
   */
  const signed = Boolean(apiKey && apiSecret);
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!signed && !preset) {
    console.error("[upload] Cloudinary signing is not configured (API key/secret or preset missing).");
    return NextResponse.json(
      { error: "Uploads are not configured yet. Please contact support.", code: "no-credentials" },
      { status: 503 }
    );
  }

  let file: FormDataEntryValue | null = null;
  let purpose = "document";
  try {
    const formData = await request.formData();
    file = formData.get("file");
    const requested = formData.get("purpose");
    if (typeof requested === "string" && ["selfie", "document", "video"].includes(requested)) {
      purpose = requested;
    }
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty. Pick the photo again." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB.` },
      { status: 413 }
    );
  }

  /*
   * Decide what the file is from its bytes, not from the label the phone put on
   * it. Android frequently sends an empty type, and HEIC photos are often
   * labelled `image/jpg`; both used to be refused as "not a photo".
   */
  const buffered = Buffer.from(await file.arrayBuffer());
  const head = new Uint8Array(buffered.subarray(0, 64));
  const kind: FileKind | null = sniffFileKind(head) ?? kindFromMime(file.type);

  if (!kind) {
    return NextResponse.json(
      { error: "That file is not a photo or a video. Pick a JPG, PNG, HEIC photo or a short clip." },
      { status: 415 }
    );
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = { folder: UPLOAD_FOLDER, timestamp };

  /*
   * No upload-time transformation on purpose.
   *
   * The device already re-encodes photos to 1600px JPEG before they are sent, so
   * a transformation here bought nothing, and older Cloudinary accounts can
   * reject it when strict transformations are switched on. Fewer signed
   * parameters means fewer ways for a perfectly good credential to fail.
   */

  const body = new FormData();
  body.append("file", file);
  for (const [key, value] of Object.entries(params)) body.append(key, value);

  if (signed) {
    body.append("api_key", apiKey as string);
    body.append("signature", sign(params, apiSecret as string));
  } else {
    body.append("upload_preset", preset as string);
    console.warn("[upload] Signed uploads are off (no CLOUDINARY_API_SECRET); using the proxied preset path.");
  }

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${kind === "video" ? "video" : "image"}/upload`,
      { method: "POST", body }
    );

    const data = (await response.json().catch(() => ({}))) as {
      secure_url?: string;
      error?: { message?: string };
    };

    if (!response.ok || !data.secure_url) {
      const reason = data.error?.message;
      console.error(`[upload] Cloudinary rejected the ${kind} (${response.status}):`, reason);
      return NextResponse.json(
        { error: explainCloudinaryError(reason), code: "cloudinary-rejected" },
        { status: 502 }
      );
    }

    /*
     * A selfie is screened the moment it lands, not at the end of signup.
     *
     * The member sees "not a human face" while the upload box is still on screen,
     * and the file is deleted from Cloudinary so a rejected photo never sits in
     * storage waiting for a reviewer. If the AI cannot run at all, the upload
     * still succeeds and the final submission sends the application to Rabi,
     * because losing a real member to an API outage is not an option.
     */
    if (purpose === "selfie" && kind === "image") {
      const screening = await screenSelfie({ mime: file.type || "image/jpeg", base64: buffered.toString("base64") });
      if (screening.state === "rejected") {
        void destroyCloudinaryAsset(data.secure_url, kind);
        console.info("[upload] selfie refused by screening", { reasons: screening.reasons, provider: screening.provider });
        return NextResponse.json(
          {
            error: rejectionMessage(screening.reasons),
            code: "kyc-selfie-rejected",
            screening: "rejected",
            reasons: screening.reasons,
          },
          { status: 422, headers: { "Cache-Control": "no-store" } }
        );
      }
      return NextResponse.json(
        {
          secure_url: data.secure_url,
          screening: screening.state satisfies ScreeningState,
          reasons: screening.reasons,
          provider: screening.provider ?? null,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({ secure_url: data.secure_url });
  } catch (error) {
    console.error("[upload] Cloudinary request failed:", (error as Error).message);
    return NextResponse.json(
      { error: "We could not reach Cloudinary. Check the server's connection and try again." },
      { status: 502 }
    );
  }
}
