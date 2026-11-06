/**
 * Document and clip uploads.
 *
 * The browser never talks to Cloudinary. It posts to `/api/upload`, which checks
 * what the bytes actually are, enforces the size cap, rate limits the caller and
 * signs the request with the API secret that stays on the server.
 *
 * Three things are deliberate here:
 *
 * 1. Images are shrunk before they leave the phone. Signup runs on mobile data
 *    and Vercel refuses bodies over 4.5 MB, so a 6 MB camera still used to fail
 *    with a message about the connection, which was never the problem.
 * 2. A weak connection gets three attempts. The first at full document quality,
 *    the second and third re-encoded smaller, because the most common real failure
 *    on a Ghanaian mobile network is a 400 KB body dying halfway through. A server
 *    that answers with a rejection is never retried, only a dropped connection.
 * 3. The real reason for a failure is surfaced. "Check your connection" is
 *    useless advice when the truth is a Cloudinary key that belongs to another
 *    cloud name.
 */

import { auth } from "@/lib/firebase";
import { getDeviceId } from "@/lib/device-id";
import { shrinkImage } from "@/lib/image-compress";
import { captureException } from "@/lib/monitoring";

export interface UploadResult {
  secure_url: string;
}

interface ServerError {
  error?: string;
  code?: string;
  retryAfter?: number;
}

/** Quality and size per attempt. The last one still reads a card number. */
const ATTEMPTS = [
  { maxSide: 1600, quality: 0.82, delayMs: 0 },
  { maxSide: 1280, quality: 0.72, delayMs: 700 },
  { maxSide: 1024, quality: 0.6, delayMs: 1800 },
];

function messageForStatus(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;

  if (status === 401) return "Please sign in again before uploading your documents.";
  if (status === 408) return "The upload timed out. Check your data and try again.";
  if (status === 413) return "That file is too big to upload. Pick a smaller photo.";
  if (status === 415) return "That file is not a photo. Pick a JPG, PNG or HEIC image.";
  if (status === 429) {
    return "That is more uploads than usual from this phone. Send your documents to Rabi on WhatsApp and she will collect them.";
  }
  if (status === 503) return "Uploads are not switched on for this site yet. Tell Rabi.";
  if (status === 504) return "The server took too long to answer. Check your data and try again.";
  return "The upload failed on the server. Try again, and tell Rabi if it keeps happening.";
}

/** A rejection we should not spend another attempt on. */
function isPermanent(status: number, code?: string): boolean {
  if (status === 429) return false; // our own limiter: a retry a second later is fine
  if (status === 408 || status === 504) return false;
  if (code === "cloudinary-rejected") return true;
  if (status >= 400 && status < 500) return true;
  return false;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The signed-in member's token, or null during signup.
 *
 * This used to load the auth module lazily on every upload. On a phone holding
 * a page from an older deploy that chunk name no longer exists, the import rejects
 * with an error that carries no message, and the member saw "Upload failed. Check
 * your connection" even though her connection was fine. The auth instance is
 * already part of the page bundle, so there is no second fetch to fail.
 */
async function currentToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    // Signup uploads happen before the account exists, so a token is a bonus.
    return user ? await user.getIdToken() : null;
  } catch {
    return null;
  }
}

async function post(file: File, token: string | null): Promise<Response> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = { "x-rabis-device": getDeviceId() };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch("/api/upload", {
    method: "POST",
    headers,
    body: formData,
    credentials: "same-origin",
  });
}

export async function uploadToCloudinary(file: File): Promise<string> {
  const token = await currentToken();
  const isImage = file.type.startsWith("image/");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < ATTEMPTS.length; attempt += 1) {
    const step = ATTEMPTS[attempt];
    if (step.delayMs) await wait(step.delayMs);

    const payload = isImage
      ? await shrinkImage(file, {
          maxSide: step.maxSide,
          quality: step.quality,
          // Attempts after the first exist because the body did not survive, so
          // force a fresh, smaller encode instead of reusing an untouched original.
          force: attempt > 0,
        })
      : file;

    let response: Response;
    try {
      response = await post(payload, token);
    } catch (networkError) {
      /*
       * A dropped request is the common case on mobile data, and the browser gives
       * us nothing useful: sometimes a TypeError with an empty message. Report it
       * with the attempt number so the pattern is visible, then try again smaller.
       */
      captureException(networkError, {
        scope: "upload-network",
        attempt: attempt + 1,
        bytes: payload.size,
        kind: file.type || "unknown",
      });
      lastError = new Error(
        "The connection dropped while sending your photo. Check your data and try again."
      );
      continue;
    }

    const data = (await response.json().catch(() => ({}))) as Partial<UploadResult> & ServerError;

    if (response.ok && data.secure_url) return data.secure_url;

    const message = messageForStatus(response.status, data.error);
    lastError = new Error(message);

    if (isPermanent(response.status, data.code)) throw lastError;

    captureException(new Error(`upload ${response.status} ${data.code ?? ""}`.trim()), {
      scope: "upload-response",
      attempt: attempt + 1,
      status: response.status,
      code: data.code,
      serverMessage: data.error,
    });
  }

  throw lastError ?? new Error("The upload did not complete. Check your data and try again.");
}
