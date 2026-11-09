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
import {
  centralFaceBox,
  decodeToGrid,
  imageGeometry,
  judgeCardPhoto,
  judgeSelfiePhoto,
  judgeSelfieWithDetection,
} from "@/lib/kyc-deterministic";
import { detectFaces } from "@/lib/kyc-face-server";
import { decodeRgba } from "@/lib/kyc-deterministic";

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

/**
 * Judge one freshly uploaded image without asking a model anything.
 *
 * The selfie slot asks "is the middle of this frame a person", using skin chroma
 * on a 32x32 render of the file Cloudinary just stored. The card slots ask "is
 * this a flat, landscape card with printing on it" using the header geometry and
 * the same render.
 *
 * A positive detection of something wrong is final. An inability to judge — no
 * Cloudinary, a render that will not decode — is not, and falls through to the
 * AI provider exactly as before, so a real member is never blocked by this.
 *
 * `bytes` is the uncompressed upload when the caller still has it; the render is
 * fetched from the delivery URL because that is the file we actually stored.
 */
async function judgeUploadedImage(
  bytes: Buffer,
  purpose: string
): Promise<{ state: "rejected" | "ok"; reasons: string[]; note?: string; face?: number | null }> {
  /*
   * Decoded here from the bytes we already hold.
   *
   * This used to ask Cloudinary to render a 32x32 PNG and decode that. It
   * looked cheaper and it was a silent hole: any failure of that one request
   * (transformations disabled on the account, a timeout, a 401) made the grid
   * null, and a null grid returned "ok" — so an unreadable check quietly became
   * an accepted photo. Decoding in-process removes the failure mode entirely.
   */
  const grid = await decodeToGrid(new Uint8Array(bytes));
  if (!grid) return { state: "ok", reasons: [] };

  const box = centralFaceBox();

  if (purpose === "selfie") {
    /*
     * The colour screen runs first because it is free and it catches the
     * simplest spoofs instantly. Then the face model answers the question the
     * colour screen cannot, on the original bytes: is there a human face here?
     *
     * A model failure is reported as "unavailable" and falls back to the colour
     * screen, so a missing model never refuses a real member and never quietly
     * accepts either.
     */
    /*
     * The model runs on every selfie, even one the colour screen already
     * dislikes. Skipping it there was a bug that refused a genuine member: her
     * deep skin tone measured 9.5% inside the box, under the 10% colour floor,
     * and the detector that scores her 0.84 never got to look.
     */
    const colour = judgeSelfiePhoto(grid, box);
    const raster = await decodeRgba(new Uint8Array(bytes));
    const detection = raster
      ? await detectFaces(raster.pixels, raster.width, raster.height)
      : { human: false, score: 0, boxes: [], status: "unavailable" as const };
    const verdict = judgeSelfieWithDetection(colour, detection);

    if (detection.status === "detected") {
      console.info("[upload] selfie accepted", { score: detection.score });
    } else if (detection.status === "unavailable") {
      console.warn("[upload] face model unavailable, falling back to colour screen", {
        detail: detection.detail,
      });
    }

    if (verdict.status === "fail") {
      return { state: "rejected", reasons: verdict.reasons.map((reason) => `selfie:${reason}`) };
    }
    /*
     * "Inconclusive" is not a refusal and must not read like one to Rabi. It is
     * a sentence she can act on: the photo got past the colour screen but no
     * face was proven, so it is her eyes that decide. Without this note the
     * reason vanished and the face simply appeared in her queue unexplained.
     */
    if (verdict.status === "inconclusive") {
      return {
        state: "ok",
        reasons: verdict.reasons.map((reason) => `selfie:${reason}`),
        note: "automated-screening-could-not-confirm-a-face-please-look-yourself",
      };
    }
    return { state: "ok", reasons: [] };
  }

  const geometry = imageGeometry(bytes) ?? null;
  const verdict = judgeCardPhoto({ geometry, grid, box });
  if (verdict.status === "fail") {
    return { state: "rejected", reasons: verdict.reasons.map((reason) => `card:${reason}`) };
  }
  if (verdict.status === "inconclusive") {
    return {
      state: "ok",
      reasons: verdict.reasons.map((reason) => `card:${reason}`),
      note: "automated-screening-could-not-confirm-a-card-please-look-yourself",
    };
  }
  return { state: "ok", reasons: [] };
}

/** A member-facing sentence for a deterministic refusal. */
function deterministicMessage(reasons: string[]): string {
  const joined = reasons.join(" ");
  if (joined.includes("no-human-skin") || joined.includes("face-region")) {
    return "That photo does not show a person's face. Take the selfie live, with the camera, facing the lens in good light. Photos of a document, a screen, a wall or an object cannot be used.";
  }
  if (joined.includes("card-not-landscape") || joined.includes("card-not-card-shaped")) {
    return "That does not look like a photograph of a card. Lay your Ghana Card flat, fill the frame with it, and photograph it the wide way round.";
  }
  if (joined.includes("card-not-flat") || joined.includes("card-no-printed-content")) {
    return "We could not see a card in that photo. Fill the frame with the whole card, flat and in focus.";
  }
  return "We could not accept that photo. Please take it again with the camera, in good light.";
}

/**
 * Run the AI provider over an already-screened image.
 *
 * Separate from POST so the order can be fixed: this runs BEFORE the file is sent
 * to Cloudinary. See the note at the upload call for why that matters.
 */
async function screenWithProviders(
  buffered: Buffer,
  mime: string,
  purpose: string
): Promise<
  | { rejected: false; state: ScreeningState; reasons: string[]; provider: string | null }
  | { rejected: true; reasons: string[]; provider: string | null }
> {
  const payload = { mime: mime || "image/jpeg", base64: buffered.toString("base64") };
  const screening = await screenSelfie(payload, purpose === "selfie" ? "selfie" : "document");
  if (screening.state === "rejected") {
    return { rejected: true, reasons: screening.reasons, provider: screening.provider ?? null };
  }
  return {
    rejected: false,
    state: screening.state,
    reasons: screening.reasons,
    provider: screening.provider ?? null,
  };
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

  /*
   * A per-instance counter is not a limit.
   *
   * On Vercel every cold start gets a fresh memory map, so `degraded: true` means
   * the number protecting Cloudinary and Firebase can be reset by simply waiting
   * for a new instance. That is the free-tier drain in slow motion.
   *
   * Signed-in members are exempt: their budget is per-uid, abuse costs them their
   * own account, and refusing them would take down the dashboard for a real
   * outage at Upstash. Anonymous KYC uploads — the ones a script can trigger
   * without any account at all — are refused instead, with a clear reason.
   */
  const anonymous = !actor;
  const degraded = budgets.some((entry) => entry.degraded);

  if (anonymous && degraded) {
    console.error(
      "[upload] refusing anonymous upload: the shared rate limiter is not reachable, so there is no global budget to spend."
    );
    return NextResponse.json(
      {
        error:
          "Photo uploads are paused for a moment while we check our connection. Please try again shortly, or send your documents to Rabi on WhatsApp.",
        code: "limiter-unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
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

  /*
   * SCREEN FIRST. UPLOAD SECOND.
   *
   * This order is the whole point of the route, and it used to be backwards: the
   * file went to Cloudinary, and only afterwards was it screened, with a delete
   * fired if the screen refused it.
   *
   * That is a free-tier drain. Cloudinary bills the upload when it happens, not
   * when the file survives. A script posting fake Ghana cards — or a wall, or the
   * same file a thousand times — spent real storage and transformation quota on
   * every attempt, and the cleanup call only tidied the bucket afterwards.
   *
   * Now a refused image never leaves this function. Only files that survive
   * screening, under the shared rate limits above, are ever sent to Cloudinary.
   */
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = { folder: UPLOAD_FOLDER, timestamp };

  /*
   * No upload-time transformation on purpose: the device already re-encodes to
   * 1600px JPEG, and older Cloudinary accounts reject transformations when strict
   * mode is on.
   */

  let screened: { state: ScreeningState; reasons: string[]; provider: string | null } | null = null;

  if (kind === "image") {
    /*
     * Every image is screened here, whichever slot it claims. `purpose` is a
     * client-declared string, so a script can post a dog photo as
     * `purpose: "document"`; the bytes decide which check applies, not the label.
     */
    const deterministic = await judgeUploadedImage(buffered, purpose);
    if (deterministic.state === "rejected") {
      console.info("[upload] refused before storage", { purpose, reasons: deterministic.reasons });
      return NextResponse.json(
        {
          error: deterministicMessage(deterministic.reasons),
          code: "kyc-screening-rejected",
          screening: "rejected",
          reasons: deterministic.reasons,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    const provider = await screenWithProviders(buffered, file.type, purpose);
    if (provider.rejected) {
      console.info("[upload] refused before storage by provider", {
        purpose,
        reasons: provider.reasons,
        provider: provider.provider,
      });
      return NextResponse.json(
        {
          error: rejectionMessage(provider.reasons),
          code: "kyc-selfie-rejected",
          screening: "rejected",
          reasons: provider.reasons,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    /*
     * Deterministic reasons are merged rather than discarded. When the screen
     * could not confirm a face, that is the most useful thing Rabi can be told,
     * and it used to be thrown away as soon as the provider returned its own
     * (usually empty) list.
     */
    const reasons = [...deterministic.reasons, ...provider.reasons];
    if (deterministic.note) reasons.push(deterministic.note);
    screened = { state: provider.state, reasons, provider: provider.provider };
  }

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

    if (screened) {
      return NextResponse.json(
        {
          secure_url: data.secure_url,
          screening: screened.state satisfies ScreeningState,
          reasons: screened.reasons,
          provider: screened.provider,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    /* Videos bypass image screening; the clip is checked by the liveness route. */
    return NextResponse.json({ secure_url: data.secure_url });
  } catch (error) {
    console.error("[upload] Cloudinary request failed:", (error as Error).message);
    return NextResponse.json(
      { error: "We could not reach Cloudinary. Check the server's connection and try again." },
      { status: 502 }
    );
  }
}
