import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { readMember, stampMember, customPlanNames } from "@/lib/server-firestore";
import { sendMail } from "@/lib/mailer";
import { newMemberAlertEmail, siteUrl } from "@/lib/email-templates";
import { ownerEmails } from "@/lib/email-policy";
import { getPlanLabel } from "@/lib/plans-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UID_RE = /^[A-Za-z0-9_-]{4,128}$/;

function describe(date: unknown): string | undefined {
  const value = date instanceof Date ? date : typeof date === "string" ? new Date(date) : null;
  if (!value || Number.isNaN(value.getTime())) return undefined;
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/**
 * Tells Rabi that somebody applied.
 *
 * A member calls this for themselves right after signup; an admin can call it
 * with a `uid` for somebody else, which is how the dashboard sweeps alerts that
 * were lost when a member closed the tab before their request landed.
 *
 * The member data is re-read from Firestore rather than taken from the request,
 * so an alert always describes a real application. `adminAlertAt` is stamped
 * after a successful send, so a retry is a no-op instead of a second email.
 *
 * Delivery goes through `sendMail`, which runs in log mode until the domain is
 * verified. In log mode the alert is written to the server console and marked
 * as handled, which is why the admin dashboard also shows pending members: that
 * list is the guarantee, this route is the convenience.
 */
export async function POST(request: Request) {
  const actor = await authenticateRequest(request);
  if (!actor) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }

  let body: { uid?: unknown; force?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body means "alert for me", which is the normal signup path.
  }

  const requestedUid = typeof body.uid === "string" ? body.uid.trim() : "";
  const force = body.force === true;

  if (requestedUid && requestedUid !== actor.uid && !actor.admin) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  const uid = requestedUid || actor.uid;

  if (!UID_RE.test(uid)) {
    return NextResponse.json({ ok: false, error: "Unknown member id" }, { status: 400 });
  }

  const limits = await rateLimit(
    `notify:new-member:${actor.uid}`,
    actor.admin ? 120 : 5,
    actor.admin ? 60 : 600
  );

  if (!limits.success) {
    return NextResponse.json(
      { ok: false, error: "Too many alert requests. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((limits.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  const member = await readMember(uid, actor.token);
  if (!member) {
    return NextResponse.json({ ok: false, error: "Member record could not be read" }, { status: 404 });
  }

  if (!force && member.adminAlertAt) {
    return NextResponse.json({ ok: true, skipped: "already-alerted", member: { name: member.name } });
  }

  if (member.status !== "pending" && !force) {
    return NextResponse.json({ ok: true, skipped: "not-pending", member: { name: member.name } });
  }

  const recipients = ownerEmails();
  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: "No admin email is configured" }, { status: 503 });
  }

  const names = await customPlanNames();
  const content = newMemberAlertEmail({
    name: member.name,
    email: member.email,
    phone: member.phone,
    planLabel: names[member.plan] || getPlanLabel(member.plan),
    createdAt: describe(member.raw.createdAt),
    dashboardUrl: `${siteUrl()}/admin`,
  });

  const result = await sendMail({
    to: recipients,
    subject: content.subject,
    html: content.html,
    text: content.text,
    tag: "admin-new-member",
  });

  // Only a handled alert is stamped, so a failure keeps showing up in the sweep.
  const recorded = result.ok
    ? await stampMember(uid, {
        adminAlertAt: new Date(),
        adminAlertProvider: result.provider,
        adminAlertId: result.id ?? null,
        adminAlertMode: result.mode,
      })
    : false;

  return NextResponse.json(
    {
      ok: result.ok,
      mode: result.mode,
      provider: result.provider,
      recorded,
      recipients: recipients.length,
      ...(result.error ? { error: result.error } : {}),
    },
    { status: result.ok ? 200 : 502 }
  );
}
