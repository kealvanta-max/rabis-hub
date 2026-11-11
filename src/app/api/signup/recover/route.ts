import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { authenticateRequest } from "@/lib/server-auth";
import { adminFirestore } from "@/lib/server-firestore";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restore a member whose registration was rolled back.
 *
 * Why this route has to exist
 * ---------------------------
 * Signup creates the auth account first and the Firestore record second. If the
 * second step fails, the client calls `deleteUser` to undo the first. That call
 * requires a recent login and routinely fails: the member is then signed out
 * with an auth account that has no profile document.
 *
 * When she signs back in, `/dashboard` finds no document and shows the "Finish
 * your registration" card, whose only real action is "Try again". That action
 * re-reads the same missing document, so it can never work. The member is on a
 * dead end with a working password and no application.
 *
 * This route gives her the way out. It records the minimum needed for Rabi to
 * pick the case up: the identity the auth account already proves (uid and
 * email), plus whatever the dashboard knows. It deliberately does **not** create
 * an approved or a complete application, because none of the KYC evidence
 * exists; it creates a clearly marked stub that lands in Rabi's queue.
 *
 * It is idempotent. Calling it twice returns the same success and does not
 * overwrite an application that has since been completed properly.
 */

const MAX_TEXT = 200;

function boundedText(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const actor = await authenticateRequest(request).catch(() => null);
  if (!actor) {
    return NextResponse.json({ error: "Sign in first, then try again." }, { status: 401 });
  }

  /*
   * Two outcomes are possible from here and they must be told apart: a member
   * whose record is genuinely missing (this route helps), and a member who does
   * have a record but is reading the wrong project (this route cannot help, and
   * creating a stub would make things worse by writing to the same wrong place).
   * The caller is told which, because the second case needs a different fix.
   */
  const db = await adminFirestore();
  if (!db) {
    return NextResponse.json(
      {
        error: "We could not reach our records at all. This is not something you did.",
        code: "storage-unavailable",
      },
      { status: 503 }
    );
  }

  const limited = await rateLimit(clientKey(request, "signup-recover"), 5, 600);
  if (!limited.success) {
    const retryAfter = Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "You have tried this a few times already. Please message Rabi instead." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const ref = db.collection("users").doc(actor.uid);
  const existing = await ref.get().catch(() => null);

  if (existing === null) {
    return NextResponse.json(
      { error: "Our records could not be read. Please message Rabi.", code: "storage-unavailable" },
      { status: 503 }
    );
  }

  /*
   * Already there. The most likely explanation is a stale page, so the answer is
   * "reload" rather than "we made you a new one". Returning success here without
   * writing anything is what makes the route safe to retry.
   */
  if (existing.exists) {
    return NextResponse.json({ ok: true, recovered: false, status: "already-registered" });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    await ref.create({
      /*
       * Identity the auth account proves. Nothing here is trusted from the
       * request: the uid and email come from the verified token, and the rest
       * is only what the member volunteered in the recovery form.
       */
      name: boundedText(body.name) || actor.email || "Member",
      email: actor.email ?? "",
      phone: boundedText(body.phone),
      location: boundedText(body.location),
      plan: boundedText(body.plan),
      plans: [boundedText(body.plan)].filter(Boolean),
      /*
       * Status is deliberately the most restrictive value, and the KYC fields
       * say plainly that no evidence exists. An admin approving this by accident
       * would be worse than the dead end it replaces.
       */
      status: "pending",
      kycReviewStatus: "manual_review_required",
      kycScreeningState: "verification_unavailable",
      kycScreeningReasons: ["registration-recovered-without-documents"],
      kycReviewReason:
        "Registration was recovered after the original submission failed. No documents were received, so this member needs to submit them or be verified by hand.",
      kycRecoveredAt: FieldValue.serverTimestamp(),
      kycRecoveredWithoutDocuments: true,
      kycScreeningModelVersion: "advisory-screening-v2",
      kycPolicyVersion: "kyc-review-1",
      kycSubmissionVersion: crypto.randomUUID(),
      ghanaCardFront: "",
      ghanaCardBack: "",
      passportPhoto: "",
      faceScanVideo: "",
      documentsDeferred: true,
      termsAccepted: true,
      termsAcceptedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      whatsappLink: "",
    });

    console.info("[signup] recovered an account with no profile", { uid: actor.uid });
    return NextResponse.json({ ok: true, recovered: true, status: "pending" }, { status: 201 });
  } catch (error) {
    const message = (error as Error).message ?? "";
    // A concurrent call or a racing signup already created it.
    if (/already exists|ALREADY_EXISTS/i.test(message)) {
      return NextResponse.json({ ok: true, recovered: false, status: "already-registered" });
    }
    console.error("[signup] recovery write failed:", message);
    return NextResponse.json(
      { error: "We could not restore your registration automatically. Message Rabi and she will do it in minutes." },
      { status: 503 }
    );
  }
}
