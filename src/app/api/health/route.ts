import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight configuration probe used by the admin "System status" card.
 * Never returns secret values – only whether each integration is present.
 */
export async function GET() {
  const emailProvider = process.env.RESEND_API_KEY
    ? "resend"
    : process.env.EMAIL_PASSWORD
    ? "gmail"
    : process.env.BACKUP_EMAIL_PASSWORD
    ? "brevo"
    : null;

  return NextResponse.json({
    firebaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    ),
    cloudinaryConfigured: Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME),
    emailProvider,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
    checkedAt: new Date().toISOString(),
  });
}
