import { NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/server-auth";
import { canSendTo, isValidEmail } from "@/lib/email-policy";
import { sendMail } from "@/lib/mailer";

export const runtime = "nodejs";

/**
 * Browser-origin check. Kept as a cheap first filter only: an `Origin` header is
 * trivially omitted by non-browser clients, so authorisation is enforced by the
 * ID-token check below, never by this.
 */
function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowed = [
    process.env.NEXT_PUBLIC_APP_URL,
    request.headers.get("host") ? `https://${request.headers.get("host")}` : null,
    request.headers.get("host") ? `http://${request.headers.get("host")}` : null,
  ]
    .filter(Boolean)
    .map((value) => String(value).replace(/\/$/, ""));

  return allowed.includes(origin.replace(/\/$/, ""));
}

/** Defence in depth for member-authored mail (self-service notifications). */
function stripActiveContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * Self-service email.
 *
 * History: this route began as an open relay with no authentication at all, then
 * gained a token check and an allowance for members to mail the owner inbox.
 * The owner allowance is now gone as well, so a member can only reach their own
 * address. Approval, rejection and new-signup alerts moved to `/api/notify/*`,
 * where the recipient and the content are built on the server and the outcome is
 * recorded, instead of being assembled by whichever browser was open.
 *
 * Sending itself is delegated to `sendMail`, which runs in log mode until the
 * sending domain is verified. That keeps one provider ladder in the codebase.
 */
export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
    }

    const actor = await authenticateRequest(request);
    if (!actor) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const limits = await rateLimit(`email:${actor.uid}`, 20, 60);
    if (!limits.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil((limits.resetAt - Date.now()) / 1000))),
          },
        }
      );
    }

    const { to, subject, html } = await request.json();

    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (typeof to !== "string" || typeof subject !== "string" || typeof html !== "string") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Header injection: a member's name flows into the subject line, so strip
    // CR/LF before it can become a new SMTP header (nodemailer CVE class).
    const safeSubject = subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200);

    if (!safeSubject || html.length > 50_000 || !isValidEmail(to)) {
      return NextResponse.json({ error: "Invalid email payload" }, { status: 400 });
    }

    const policy = canSendTo(actor, to);
    if (!policy.allowed) {
      console.warn("[email] blocked recipient", { uid: actor.uid, reason: policy.reason });
      return NextResponse.json(
        { error: "You can only send mail to your own address" },
        { status: 403 }
      );
    }

    // Members may only send mail they could not weaponise: strip scripts,
    // iframes and inline handlers from anything that is not from an admin.
    const safeHtml = actor.admin ? html : stripActiveContent(html);

    const result = await sendMail({
      to: to.trim(),
      subject: safeSubject,
      html: safeHtml,
      tag: "self-service",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "Email could not be sent", details: result.error },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
      mode: result.mode,
      messageId: result.id,
    });
  } catch (error) {
    console.error("Email route error:", error);
    return NextResponse.json({ error: "Failed to process email request" }, { status: 500 });
  }
}
