/**
 * Document and clip uploads.
 *
 * The browser never talks to Cloudinary. It posts to `/api/upload`, which checks
 * what the bytes actually are, enforces the size cap, rate limits the caller and
 * signs the request with the API secret that stays on the server.
 *
 * Two things are deliberate here:
 *
 * 1. Images are shrunk before they leave the phone. Signup runs on mobile data
 *    and Vercel refuses bodies over 4.5 MB, so a 6 MB camera still used to fail
 *    with a message about the connection, which was never the problem.
 * 2. The real reason for a failure is surfaced. "Check your connection" is
 *    useless advice when the truth is a Cloudinary key that belongs to another
 *    cloud name.
 */

import { shrinkImage } from "@/lib/image-compress";

export interface UploadResult {
  secure_url: string;
}

function messageForStatus(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;

  if (status === 401) return "Please sign in again before uploading your documents.";
  if (status === 413) return "That file is too big to upload. Pick a smaller photo.";
  if (status === 415) return "That file is not a photo. Pick a JPG, PNG or HEIC image.";
  if (status === 429) return "Too many uploads in a row. Wait a minute and try again.";
  if (status === 503) return "Uploads are not switched on for this site yet. Tell Rabi.";
  return "The upload failed on the server. Try again, and tell Rabi if it keeps happening.";
}

export async function uploadToCloudinary(file: File): Promise<string> {
  const payload = file.type.startsWith("image/") ? await shrinkImage(file) : file;

  const { getAuth } = await import("firebase/auth");
  const user = getAuth().currentUser;

  // Signup uploads before the account exists, so a token is a bonus, not a
  // requirement. The route applies a much stricter rate limit without one.
  let token: string | null = null;
  if (user) {
    try {
      token = await user.getIdToken();
    } catch {
      token = null;
    }
  }

  const formData = new FormData();
  formData.append("file", payload);

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const data = (await response.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };

  if (!response.ok || !data.secure_url) {
    throw new Error(messageForStatus(response.status, data.error));
  }

  return data.secure_url;
}
