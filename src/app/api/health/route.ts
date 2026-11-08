import { NextResponse } from "next/server";

import { criticalGaps, integrationStatus } from "@/lib/integrations";
import { authenticateRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * Configuration probe, used by the admin "System status" card and by Rabi after
 * pasting keys into Vercel. Returns presence and shape only — never a value.
 */
export async function GET(request: Request) {
  const actor = await authenticateRequest(request).catch(() => null);
  const emailProvider = process.env.RESEND_API_KEY
    ? "resend"
    : process.env.EMAIL_PASSWORD
    ? "gmail"
    : process.env.BACKUP_EMAIL_PASSWORD
    ? "brevo"
    : null;

  const integrations = integrationStatus();
  const gaps = criticalGaps();
  const build = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "local";

  // Public uptime probes need only the outcome and build identifier. Detailed
  // deployment configuration is exposed only to a server-verified admin claim.
  if (!actor?.admin) {
    return NextResponse.json(
      { status: gaps.length === 0 ? "ready" : "misconfigured", build },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      status: gaps.length === 0 ? "ready" : "misconfigured",
      firebaseConfigured: integrations.find((i) => i.id === "firebase")?.configured ?? false,
      cloudinaryConfigured: integrations.find((i) => i.id === "cloudinary")?.configured ?? false,
      emailProvider,
      /*
       * Which mode the mailer is in. "log" is the deliberate pre-domain state:
       * the notify routes run, the message is printed to the server console and
       * the member record says "logged". Flipping MAIL_MODE=live is the only
       * change needed once the sending domain is verified.
       */
      mailMode: (process.env.MAIL_MODE || "").toLowerCase() === "live" ? "live" : "log",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      integrations: integrations.map(({ id, label, category, configured, missing }) => ({
        id,
        label,
        category,
        configured,
        missing,
      })),
      criticalGaps: gaps,
      /*
       * Which build is answering.
       *
       * "Is production actually on the fix?" cost us a whole evening of guessing
       * while the deploy was quietly behind. Vercel sets this on every deployment,
       * so the answer is now one request away instead of a screenshot and an
       * argument.
       */
      build,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
