import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { authenticateRequest } from "@/lib/server-auth";
import { adminFirestore } from "@/lib/server-firestore";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECKS = ["frontBackInspected", "numberMatched", "selfieMatched", "livenessReviewed"] as const;
type Decision = "approved" | "rejected" | "pending";

export async function POST(request: Request, context: { params: { uid: string } }) {
  const actor = await authenticateRequest(request);
  if (!actor?.admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const limits = await rateLimit(`admin:decision:${actor.uid}`, 30, 60);
  if (!limits.success) return NextResponse.json({ error: "Too many decisions. Try again shortly." }, { status: 429 });

  const uid = context.params.uid;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(uid)) return NextResponse.json({ error: "Invalid member id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid decision request" }, { status: 400 });
  }
  const status = body.status;
  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const checklist = body.checklist && typeof body.checklist === "object"
    ? body.checklist as Record<string, unknown>
    : {};

  const db = await adminFirestore();
  if (!db) return NextResponse.json({ error: "Secure decision service is unavailable" }, { status: 503 });
  const ref = db.collection("users").doc(uid);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("member-not-found");
      const member = snapshot.data() ?? {};
      if (member.status !== "pending" && status !== "pending") throw new Error("member-not-pending");
      if (member.status === "pending" && status === "pending") throw new Error("member-already-pending");

      if (status === "approved") {
        const allChecked = CHECKS.every((key) => checklist[key] === true);
        const cloud = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "").trim();
        const hasEvidence = [member.ghanaCardFront, member.ghanaCardBack, member.passportPhoto]
          .every((value) => {
            if (typeof value !== "string" || !cloud) return false;
            try {
              const url = new URL(value);
              return url.protocol === "https:" && url.hostname === "res.cloudinary.com" &&
                url.pathname.startsWith(`/${cloud}/`) && url.pathname.includes("/rabis-kyc/");
            } catch {
              return false;
            }
          });
        const hashes = member.evidenceHashes && typeof member.evidenceHashes === "object"
          ? member.evidenceHashes as Record<string, unknown>
          : {};
        const hashesBound = ["front", "back", "selfie"].every((key) =>
          typeof hashes[key] === "string" && /^[a-f0-9]{64}$/.test(hashes[key] as string)
        );
        if (!allChecked || !hasEvidence || !hashesBound || member.documentsDeferred === true) {
          throw new Error("manual-review-incomplete");
        }
      }

      transaction.update(ref, {
        status,
        whatsappLink: "",
        kycReviewStatus: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "manual_review_required",
        kycReviewReason: status === "approved" ? "Manual review completed" : reason || member.kycReviewReason || "Manual review required",
        reviewerUid: actor.uid,
        reviewerEmail: actor.email ?? "",
        reviewedAt: FieldValue.serverTimestamp(),
        reviewChecklist: status === "approved" ? Object.fromEntries(CHECKS.map((key) => [key, true])) : {},
        kycPolicyVersion: "kyc-review-1",
        decisionId: crypto.randomUUID(),
      });
      return { uid, status };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "decision-failed";
    const statusCode = message === "member-not-found" ? 404 : message === "member-not-pending" ? 409 : message === "manual-review-incomplete" ? 422 : 503;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
