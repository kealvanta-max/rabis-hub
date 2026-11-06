/**
 * Email content, kept as pure functions.
 *
 * Every builder returns `{ subject, html, text }` and touches nothing: no
 * network, no env beyond the public site URL, no clock. That makes the copy
 * unit-testable and keeps it out of the route handlers, where a template tweak
 * would otherwise need a redeploy of the sending logic too.
 *
 * Rules this file follows:
 * - names and reasons are member-supplied, so they are escaped, always;
 * - every message carries a plain-text part (a missing one is a spam signal);
 * - no em dashes, which Rabi reads as a machine wrote the message.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export const SUPPORT_PHONE = "+233 50 470 1032";
export const SUPPORT_EMAIL = "rabisavinghub@gmail.com";

export function siteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  return (configured || "https://rabis-saving-hub.vercel.app").replace(/\/$/, "");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Header injection guard: a name flows into a subject line. */
function safeSubject(value: string, fallback: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  return cleaned || fallback;
}

const BRAND = "#0f766e";
const INK = "#111827";
const MUTED = "#4b5563";

function layout({
  preheader,
  heading,
  paragraphs,
  cta,
  footerNote,
}: {
  preheader: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  footerNote?: string;
}): string {
  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:${INK};">${paragraph}</p>`
    )
    .join("");

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px 0;">
         <tr><td style="border-radius:10px;background:${BRAND};">
           <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:13px 22px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(
             cta.label
           )}</a>
         </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(
    preheader
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;">
        <tr>
          <td style="padding:22px 26px 0 26px;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:600;color:${BRAND};">Rabi's Saving Hub</p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 26px 4px 26px;">
            <h1 style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:21px;line-height:1.35;color:${INK};">${escapeHtml(
              heading
            )}</h1>
            ${body}
            ${button}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 26px 24px 26px;">
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0 14px 0;">
            <p style="margin:0 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
              Rabi's Saving Hub, Accra, Ghana
            </p>
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
              Questions? WhatsApp ${escapeHtml(SUPPORT_PHONE)} or reply to this email.${
                footerNote ? ` ${escapeHtml(footerNote)}` : ""
              }
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function firstName(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0].slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Member facing                                                      */
/* ------------------------------------------------------------------ */

export function approvalEmail({
  name,
  planLabel,
  whatsappLink,
}: {
  name: string;
  planLabel: string;
  whatsappLink?: string;
}): EmailContent {
  const plan = planLabel || "your savings plan";
  const dashboard = `${siteUrl()}/dashboard`;
  const group = whatsappLink || dashboard;

  const html = layout({
    preheader: `Your ${plan} account is approved.`,
    heading: `You're approved, ${firstName(name)}`,
    paragraphs: [
      `Your account for the <strong>${escapeHtml(plan)}</strong> plan is approved and ready to use.`,
      "Open your dashboard to see your plan, your payment schedule and the savings Rabi has recorded for you.",
      whatsappLink
        ? "Your WhatsApp community group is open. Use the button below to join it, that is where Rabi posts collection days and updates."
        : "Rabi will send your WhatsApp group link shortly. If you need it sooner, reply to this email.",
    ],
    cta: { label: whatsappLink ? "Join your WhatsApp group" : "Open your dashboard", href: group },
  });

  const text = [
    `You're approved, ${firstName(name)}`,
    "",
    `Your account for the ${plan} plan is approved and ready to use.`,
    "Open your dashboard to see your plan, your payment schedule and the savings Rabi has recorded for you.",
    whatsappLink
      ? "Join your WhatsApp community group here:"
      : "Rabi will send your WhatsApp group link shortly.",
    group,
    "",
    "Rabi's Saving Hub, Accra, Ghana",
    `Questions? WhatsApp ${SUPPORT_PHONE} or reply to this email.`,
  ].join("\n");

  return {
    subject: safeSubject(`Your Rabi's Saving Hub account is approved`, "Your account is approved"),
    html,
    text,
  };
}

export function rejectionEmail({ name, reason }: { name: string; reason?: string }): EmailContent {
  const why =
    (reason || "").trim() ||
    "The documents we received did not pass our verification checks.";

  const html = layout({
    preheader: "An update on your application.",
    heading: `Hello ${firstName(name)}`,
    paragraphs: [
      "We have reviewed your application to join Rabi's Saving Hub, and we cannot approve it at this time.",
      `<strong>Reason:</strong> ${escapeHtml(why)}`,
      "If you believe this was a mistake, or you have new documents to send, message Rabi on WhatsApp. She will reset your application so you can upload again.",
    ],
    cta: { label: "Message Rabi on WhatsApp", href: `https://wa.me/233504701032` },
  });

  const text = [
    `Hello ${firstName(name)}`,
    "",
    "We have reviewed your application to join Rabi's Saving Hub, and we cannot approve it at this time.",
    `Reason: ${why}`,
    "",
    "If you believe this was a mistake, or you have new documents to send, message Rabi on WhatsApp. She will reset your application so you can upload again.",
    "WhatsApp: " + SUPPORT_PHONE,
    "",
    "Rabi's Saving Hub, Accra, Ghana",
  ].join("\n");

  return {
    subject: "An update on your Rabi's Saving Hub application",
    html,
    text,
  };
}

export function applicationReceivedEmail({
  name,
  planLabel,
}: {
  name: string;
  planLabel: string;
}): EmailContent {
  const plan = planLabel || "your savings plan";

  const html = layout({
    preheader: "We received your application and are reviewing it.",
    heading: `Thanks ${firstName(name)}, we have your application`,
    paragraphs: [
      `We received your application for the <strong>${escapeHtml(plan)}</strong> plan.`,
      "Rabi is checking your Ghana Card and selfie now. This usually takes less than a day.",
      "You will get another email the moment there is a decision, and your dashboard will update at the same time.",
    ],
    cta: { label: "Open your dashboard", href: `${siteUrl()}/dashboard` },
  });

  const text = [
    `Thanks ${firstName(name)}, we have your application`,
    "",
    `We received your application for the ${plan} plan.`,
    "Rabi is checking your Ghana Card and selfie now. This usually takes less than a day.",
    "You will get another email the moment there is a decision, and your dashboard will update at the same time.",
    "",
    `${siteUrl()}/dashboard`,
    "Rabi's Saving Hub, Accra, Ghana",
  ].join("\n");

  return {
    subject: "We received your Rabi's Saving Hub application",
    html,
    text,
  };
}

/* ------------------------------------------------------------------ */
/* Admin facing                                                       */
/* ------------------------------------------------------------------ */

export function newMemberAlertEmail({
  name,
  email,
  phone,
  planLabel,
  createdAt,
  dashboardUrl,
}: {
  name: string;
  email: string;
  phone: string;
  planLabel: string;
  createdAt?: string;
  dashboardUrl?: string;
}): EmailContent {
  const who = name || email || "A new member";
  const when = createdAt ? `Applied ${createdAt}.` : "";

  const html = layout({
    preheader: `${who} just applied.`,
    heading: `New application: ${who}`,
    paragraphs: [
      `<strong>Name:</strong> ${escapeHtml(name || "Not provided")}`,
      `<strong>Email:</strong> ${escapeHtml(email || "Not provided")}`,
      `<strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}`,
      `<strong>Plan:</strong> ${escapeHtml(planLabel || "Not provided")}`,
      when ? escapeHtml(when) : "",
      "Open the admin dashboard to check the Ghana Card, the selfie and the card number, then approve or reject.",
    ].filter(Boolean),
    cta: { label: "Review the application", href: dashboardUrl || `${siteUrl()}/admin` },
  });

  const text = [
    `New application: ${who}`,
    "",
    `Name: ${name || "Not provided"}`,
    `Email: ${email || "Not provided"}`,
    `Phone: ${phone || "Not provided"}`,
    `Plan: ${planLabel || "Not provided"}`,
    when,
    "",
    "Review it: " + (dashboardUrl || `${siteUrl()}/admin`),
    "",
    "Rabi's Saving Hub, Accra, Ghana",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: safeSubject(`New application: ${who}`, "New member application"),
    html,
    text,
  };
}
