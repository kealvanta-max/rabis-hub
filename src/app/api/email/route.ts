import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

const FROM_GMAIL = process.env.EMAIL_USER || "rabisavinghub@gmail.com";
const FROM_RESEND = process.env.EMAIL_FROM || "Rabi's Saving Hub <onboarding@resend.dev>";

/** Reject requests that clearly come from another website. */
function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches may omit it in some browsers

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

    const limits = await rateLimit(clientKey(request, "email"), 10, 60);
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) || subject.length > 200 || html.length > 50_000) {
      return NextResponse.json({ error: "Invalid email payload" }, { status: 400 });
    }

    let lastError: unknown = null;

    if (process.env.RESEND_API_KEY) {
      try {
        const result = await sendWithResend(to, subject, html);
        return NextResponse.json({ success: true, provider: "resend", messageId: result?.id });
      } catch (error) {
        lastError = error;
        console.warn("Resend failed, trying Gmail SMTP:", error);
      }
    }

    if (process.env.EMAIL_PASSWORD) {
      try {
        const result = await sendWithGmail(to, subject, html);
        return NextResponse.json({ success: true, provider: "gmail", messageId: result.messageId });
      } catch (error) {
        lastError = error;
        console.warn("Gmail SMTP failed, trying Brevo backup:", error);
      }
    }

    if (process.env.BACKUP_EMAIL_PASSWORD && process.env.BACKUP_EMAIL_USER) {
      try {
        const result = await sendWithBrevo(to, subject, html);
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
