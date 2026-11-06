import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/server-auth";
import {
  explainCloudinaryError,
  kindFromMime,
  MAX_UPLOAD_BYTES,
  sniffFileKind,
  UPLOAD_FOLDER,
  type FileKind,
} from "@/lib/file-kind";

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
   * The budget has to survive a broken credential, not just abuse.
   *
   * A member retrying three documents while storage is misconfigured used to burn
   * a 40-an-hour allowance in minutes and then get locked out by a message about
   * "too many uploads", which is a second, unrelated wall in front of the real
   * error. The ceiling is now high enough for a whole class of retries, while
   * still stopping a script. Carrier-grade NAT means many real members share one
   * address, so the anonymous number is deliberately not tight.
   */
  const limit = actor
    ? await rateLimit(`upload:${actor.uid}`, 90, 300)
    : await rateLimit(`upload:ip:${clientIp(request)}`, 150, 3600);

  if (!limit.success) {
    return NextResponse.json(
      {
        error:
          "Too many upload attempts from this connection in the last hour. Wait a few minutes, or send your documents to Rabi on WhatsApp.",
        code: "rate-limited",
      },
      { status: 429 }
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
  try {
    const formData = await request.formData();
    file = formData.get("file");
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
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
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

    return NextResponse.json({ secure_url: data.secure_url });
  } catch (error) {
    console.error("[upload] Cloudinary request failed:", (error as Error).message);
    return NextResponse.json(
      { error: "We could not reach Cloudinary. Check the server's connection and try again." },
      { status: 502 }
    );
  }
}
