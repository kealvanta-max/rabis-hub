import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { authenticateRequest } from "@/lib/server-auth";
import { canSendTo, ownerEmails } from "@/lib/email-policy";

export const runtime = "nodejs";

const FROM_GMAIL = process.env.EMAIL_USER || "rabisavinghub@gmail.com";
const FROM_RESEND = process.env.EMAIL_FROM || "Rabi's Saving Hub <onboarding@resend.dev>";

/**
 * Browser-origin check. Kept as a cheap first filter only: an `Origin` header is
 * trivially omitted by non-browser clients, so authorisation is enforced by the
 * ID-token check below, never by this.
 */
/** Defence in depth for member-initiated mail (self-service notifications). */
function stripActiveContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

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

async function sendWithResend(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_RESEND, to: [to], subject, html }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${details.slice(0, 200)}`);
  }

  return response.json();
}

async function sendWithGmail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: FROM_GMAIL,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
  return transporter.sendMail({ from: `Rabi's Saving Hub <${FROM_GMAIL}>`, to, subject, html });
}

async function sendWithBrevo(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.BACKUP_EMAIL_USER,
      pass: process.env.BACKUP_EMAIL_PASSWORD,
    },
  });
  return transporter.sendMail({
    from: `Rabi's Saving Hub <${process.env.BACKUP_EMAIL_USER || "noreply@rabis-hub.com"}>`,
    to,
    subject,
    html,
  });
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
    }

    /*
     * SECURITY: this route used to be an open relay — no auth, and an absent
     * Origin header was treated as trusted, so `curl` could send any HTML to any
     * address from Rabi's verified domain (perfect phishing). Every request now
     * needs a valid Firebase ID token, and a non-admin may only mail themselves
     * or the owner inbox.
     */
    const actor = await authenticateRequest(request);
    if (!actor) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const limits = await rateLimit(`email:${actor.uid}`, 20, 60);
    if (!limits.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limits.resetAt - Date.now()) / 1000))) } }
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

    if (!safeSubject || html.length > 50_000) {
      return NextResponse.json({ error: "Invalid email payload" }, { status: 400 });
    }

    const policy = canSendTo(actor, to, ownerEmails());
    if (!policy.allowed) {
      console.warn("[email] blocked recipient", { uid: actor.uid, to, reason: policy.reason });
      return NextResponse.json({ error: "You cannot send mail to that address" }, { status: 403 });
    }

    // Members may only send mail they could not weaponise: strip scripts,
    // iframes and inline handlers from anything that is not from an admin.
    const safeHtml = actor.admin ? html : stripActiveContent(html);

    let lastError: unknown = null;

    if (process.env.RESEND_API_KEY) {
      try {
        const result = await sendWithResend(to, safeSubject, safeHtml);
        return NextResponse.json({ success: true, provider: "resend", messageId: result?.id });
      } catch (error) {
        lastError = error;
        console.warn("Resend failed, trying Gmail SMTP:", error);
      }
    }

    if (process.env.EMAIL_PASSWORD) {
      try {
        const result = await sendWithGmail(to, safeSubject, safeHtml);
        return NextResponse.json({ success: true, provider: "gmail", messageId: result.messageId });
      } catch (error) {
        lastError = error;
        console.warn("Gmail SMTP failed, trying Brevo backup:", error);
      }
    }

    if (process.env.BACKUP_EMAIL_PASSWORD && process.env.BACKUP_EMAIL_USER) {
      try {
        const result = await sendWithBrevo(to, safeSubject, safeHtml);
        return NextResponse.json({ success: true, provider: "brevo", messageId: result.messageId });
      } catch (error) {
        lastError = error;
        console.error("Brevo SMTP also failed:", error);
      }
    }

    if (lastError) {
      return NextResponse.json(
        { error: "All email providers failed", details: (lastError as Error).message },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Email providers not configured" }, { status: 503 });
  } catch (error) {
    console.error("Email route error:", error);
    return NextResponse.json({ error: "Failed to process email request" }, { status: 500 });
  }
}
