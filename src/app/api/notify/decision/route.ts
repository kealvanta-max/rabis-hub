import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { readMember, stampMember, customPlanNames } from "@/lib/server-firestore";
import { sendMail, mailMode } from "@/lib/mailer";
import { approvalEmail, rejectionEmail } from "@/lib/email-templates";
import { getPlanLabel } from "@/lib/plans-data";
import { isValidEmail } from "@/lib/email-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UID_RE = /^[A-Za-z0-9_-]{4,128}$/;

/**
 * Sends the approval or rejection email for a member. Admin only.
 *
 * This replaces a browser call that fired the mail with the admin's own session
 * and swallowed every failure, so "User approved" on screen proved nothing. Now
 * the server reads the member from Firestore, so the address and the name in
 * the email cannot be spoofed by the caller, and the outcome is written back
 * onto the member record: `decisionEmailStatus` is `sent`, `logged` or `failed`,
 * with the provider and the error. Rabi can see which of her members was
 * actually told.
 *
 * Delivery itself goes through `sendMail`, which currently runs in log mode
 * until the sending domain is verified.
 */
export async function POST(request: Request) {
  const actor = await authenticateRequest(request);
  if (!actor) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }

  if (!actor.admin) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  const limits = await rateLimit(`notify:decision:${actor.uid}`, 30, 60);
  if (!limits.success) {
    return NextResponse.json(
      { ok: false, error: "Too many emails in a row. Wait a moment and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((limits.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  let body: { uid?: unknown; decision?: unknown; reason?: unknown; force?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const force = body.force === true;

  if (!UID_RE.test(uid)) {
    return NextResponse.json({ ok: false, error: "Unknown member id" }, { status: 400 });
  }

  if (!decision) {
    return NextResponse.json({ ok: false, error: "Decision must be approved or rejected" }, { status: 400 });
  }

  const member = await readMember(uid, actor.token);
  if (!member) {
    return NextResponse.json({ ok: false, error: "Member record could not be read" }, { status: 404 });
  }

  if (!isValidEmail(member.email)) {
    return NextResponse.json(
      { ok: false, error: "This member has no usable email address on file" },
      { status: 422 }
    );
  }

  const mode = mailMode();

  if (!force && member.decisionEmailAt && member.decisionEmailFor === decision) {
    return NextResponse.json({
      ok: true,
      skipped: "already-sent",
      mode,
      member: { name: member.name, email: member.email, status: member.status },
    });
  }

  const names = await customPlanNames();
  const planLabel = names[member.plan] || getPlanLabel(member.plan);

  const content =
    decision === "approved"
      ? approvalEmail({ name: member.name, planLabel, whatsappLink: member.whatsappLink })
      : rejectionEmail({ name: member.name, reason });

  const result = await sendMail({
    to: member.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    tag: decision === "approved" ? "decision-approved" : "decision-rejected",
  });

  const emailStatus = result.ok ? (result.provider === "console" ? "logged" : "sent") : "failed";

  const recorded = await stampMember(uid, {
    decisionEmailAt: new Date(),
    decisionEmailFor: decision,
    decisionEmailStatus: emailStatus,
    decisionEmailProvider: result.provider,
    decisionEmailId: result.id ?? null,
    decisionEmailMode: result.mode,
    decisionEmailError: result.ok ? null : (result.error ?? "unknown error").slice(0, 300),
  });

  if (!recorded) {
    console.warn(
      "[notify:decision] email handled but the member record was not stamped. " +
        "Set FIREBASE_SERVICE_ACCOUNT_KEY on the server so delivery can be recorded."
    );
  }

  return NextResponse.json(
    {
      ok: result.ok,
      mode: result.mode,
      provider: result.provider,
      emailStatus,
      recorded,
      member: { name: member.name, email: member.email, status: member.status },
      ...(recorded ? {} : { warning: "Delivery was not recorded: no service account on the server." }),
      ...(result.error ? { error: result.error } : {}),
    },
    { status: result.ok ? 200 : 502 }
  );
}
