/**
 * The one place this app sends email from.
 *
 * Two modes, chosen by `MAIL_MODE`:
 *
 * - `log` (default). Nothing leaves the server. The full message, including the
 *   plain-text body, is printed to the server console and the call reports
 *   success. This is what runs today: Resend will not deliver to anybody until
 *   rabissavinghub.com exists and its DNS records are verified, so sending for
 *   real would only produce a silent 403. The routes, templates and bookkeeping
 *   are all exercised exactly as they will be on the day of the switch.
 * - `live`. Resend first, then Gmail SMTP, then Brevo SMTP, in that order. Any
 *   failure is returned as data, never thrown, so a caller can record it.
 *
 * Set `MAIL_MODE=live` in Vercel once the domain is verified. No code changes.
 */

import nodemailer from "nodemailer";

export type MailMode = "log" | "live";
export type MailProvider = "console" | "resend" | "gmail" | "brevo" | "none";

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Template name, so the log line says which message this is. */
  tag?: string;
}

export interface MailResult {
  ok: boolean;
  provider: MailProvider;
  mode: MailMode;
  id?: string;
  /** Recipients that were actually attempted, for the route to record. */
  to: string[];
  error?: string;
}

const DEFAULT_FROM = "Rabi's Saving Hub <onboarding@resend.dev>";

export function mailMode(): MailMode {
  return (process.env.MAIL_MODE || "").trim().toLowerCase() === "live" ? "live" : "log";
}

export function senderAddress(): string {
  return (process.env.EMAIL_FROM || DEFAULT_FROM).trim();
}

export function ownerReplyTo(): string {
  return (process.env.EMAIL_REPLY_TO || process.env.ADMIN_EMAILS || "rabisavinghub@gmail.com")
    .split(",")[0]
    .trim();
}

function normaliseRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  const seen = new Map<string, string>();

  for (const entry of list) {
    const address = String(entry || "").trim();
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, address);
    if (seen.size >= 25) break;
  }

  return Array.from(seen.values());
}

function looksLikeTestingSender(from: string): boolean {
  return /@resend\.dev/i.test(from);
}

/**
 * Sends, or logs. Never throws: every caller is a request handler that has to
 * return something useful even when the mail layer is down.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const mode = mailMode();
  const recipients = normaliseRecipients(message.to);
  const subject = String(message.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const from = senderAddress();

  if (recipients.length === 0 || !subject || !message.html) {
    const error = "Mail message is missing a recipient, subject or body";
    console.warn("[mail] rejected incomplete message", { tag: message.tag, to: recipients.length });
    return { ok: false, provider: "none", mode, to: recipients, error };
  }

  if (mode === "log") {
    logMessage({ from, subject, recipients, tag: message.tag, text: message.text, html: message.html });
    return {
      ok: true,
      provider: "console",
      mode,
      id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      to: recipients,
    };
  }

  if (looksLikeTestingSender(from)) {
    console.warn(
      "[mail] EMAIL_FROM still points at resend.dev. Resend only delivers that sender to the account owner, " +
        "so member mail will fail with 403 until rabissavinghub.com is verified."
    );
  }

  const replyTo = message.replyTo || ownerReplyTo();
  const attempts: { provider: MailProvider; run: () => Promise<{ id: string }> }[] = [];

  if (process.env.RESEND_API_KEY) {
    attempts.push({
      provider: "resend",
      run: async () => {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: recipients,
            subject,
            html: message.html,
            ...(message.text ? { text: message.text } : {}),
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });

        if (!response.ok) {
          const details = await response.text().catch(() => "");
          throw new Error(`Resend ${response.status}: ${details.slice(0, 300)}`);
        }

        const body = (await response.json().catch(() => ({}))) as { id?: string };
        return { id: body?.id || "resend-ok" };
      },
    });
  }

  if (process.env.EMAIL_PASSWORD) {
    attempts.push({
      provider: "gmail",
      run: async () => {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: { user: process.env.EMAIL_USER || "rabisavinghub@gmail.com", pass: process.env.EMAIL_PASSWORD },
        });
        const info = await transporter.sendMail({
          from,
          to: recipients.join(", "),
          subject,
          html: message.html,
          text: message.text,
          replyTo,
        });
        return { id: info.messageId || "gmail-ok" };
      },
    });
  }

  if (process.env.BACKUP_EMAIL_PASSWORD && process.env.BACKUP_EMAIL_USER) {
    attempts.push({
      provider: "brevo",
      run: async () => {
        const transporter = nodemailer.createTransport({
          host: "smtp-relay.brevo.com",
          port: 587,
          secure: false,
          auth: { user: process.env.BACKUP_EMAIL_USER, pass: process.env.BACKUP_EMAIL_PASSWORD },
        });
        const info = await transporter.sendMail({
          from,
          to: recipients.join(", "),
          subject,
          html: message.html,
          text: message.text,
          replyTo,
        });
        return { id: info.messageId || "brevo-ok" };
      },
    });
  }

  if (attempts.length === 0) {
    const error = "MAIL_MODE=live but no email provider is configured";
    console.error("[mail]", error);
    return { ok: false, provider: "none", mode, to: recipients, error };
  }

  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      console.info("[mail] sent", { provider: attempt.provider, tag: message.tag, to: recipients.length });
      return { ok: true, provider: attempt.provider, mode, id: result.id, to: recipients };
    } catch (error) {
      const detail = (error as Error).message || "unknown error";
      failures.push(`${attempt.provider}: ${detail}`);
      console.warn("[mail] provider failed", { provider: attempt.provider, detail });
    }
  }

  return {
    ok: false,
    provider: "none",
    mode,
    to: recipients,
    error: failures.join(" | ").slice(0, 400),
  };
}

function logMessage({
  from,
  subject,
  recipients,
  tag,
  text,
  html,
}: {
  from: string;
  subject: string;
  recipients: string[];
  tag?: string;
  text?: string;
  html: string;
}) {
  const preview = (text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 400);

  console.info(
    [
      "",
      "================ EMAIL (LOG MODE, NOT SENT) ================",
      `template: ${tag || "unspecified"}`,
      `from:     ${from}`,
      `to:       ${recipients.join(", ")}`,
      `subject:  ${subject}`,
      `body:     ${preview}${preview.length >= 400 ? " ..." : ""}`,
      "MAIL_MODE=log. Set MAIL_MODE=live once the sending domain is verified.",
      "===========================================================",
      "",
    ].join("\n")
  );
}
