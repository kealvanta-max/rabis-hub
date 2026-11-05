/**
 * Signed document uploads.
 *
 * Previously the browser posted straight to Cloudinary with an *unsigned* preset,
 * which means the preset name in this bundle was a public write key: anyone could
 * push files (or worse) into Rabi's Cloudinary account. Uploads now go through
 * `/api/upload`, which verifies the member's Firebase ID token and signs the
 * request with the API secret that never leaves the server.
 */

export interface UploadResult {
  secure_url: string;
}

export async function uploadToCloudinary(file: File): Promise<string> {
  const { getAuth } = await import("firebase/auth");
  const user = getAuth().currentUser;

  if (!user) {
    throw new Error("Please sign in again before uploading your documents.");
  }

  const token = await user.getIdToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = (await response.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };

  if (!response.ok || !data.secure_url) {
    throw new Error(data.error || "Image upload failed. Check your connection and try again.");
  }

  return data.secure_url;
}
