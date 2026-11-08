import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { UPLOAD_FOLDER } from "@/lib/file-kind";
import { authenticateRequest } from "@/lib/server-auth";
import { adminFirestore } from "@/lib/server-firestore";
import { kycVisionConfigured, screenKycImages, type VisionScreening } from "@/lib/kyc-vision";
import { rejectionMessage } from "@/lib/kyc-vision-policy";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leave room for bounded Cloudinary hashing and the 25s worker timeout. If the
// worker cold-starts or exceeds that bound, signup still persists for review.
export const maxDuration = 60;

const MAX_TEXT = 500;
const CLOUDINARY_HOST = "res.cloudinary.com";

function boundedText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= max ? text : null;
}

function evidenceUrl(value: unknown, required = false): string | null {
  if (value === "" && !required) return "";
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const cloud = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "").trim();
    if (!cloud || url.protocol !== "https:" || url.hostname !== CLOUDINARY_HOST) return null;
    if (!url.pathname.startsWith(`/${cloud}/`) || !url.pathname.includes(`/${UPLOAD_FOLDER}/`)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

interface EvidenceDigest { sha256: string; mime: string; bytes: number; base64?: string }

async function hashEvidence(url: string, expected: "image" | "video", includeBase64 = false): Promise<EvidenceDigest> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", redirect: "error" });
    if (!response.ok || !response.body) throw new Error("evidence-unavailable");
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!contentType.startsWith(`${expected}/`)) throw new Error("evidence-type-invalid");
    const declared = Number(response.headers.get("content-length") ?? 0);
    const maxBytes = expected === "video" ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
    if (declared > maxBytes) throw new Error("evidence-too-large");
    const reader = response.body.getReader();
    const hash = crypto.createHash("sha256");
    const chunks: Buffer[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("evidence-too-large");
      }
      hash.update(value);
      if (includeBase64) chunks.push(Buffer.from(value));
    }
    if (bytes === 0) throw new Error("evidence-empty");
    return {
      sha256: hash.digest("hex"),
      mime: contentType,
      bytes,
      ...(includeBase64 ? { base64: Buffer.concat(chunks).toString("base64") } : {}),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Submit a signup through the trusted server boundary. Browser-provided KYC
 * results and reasons are deliberately ignored. Every application begins in
 * manual review because browser OCR, MRZ parsing and image heuristics are not
 * authoritative identity verification.
 */
export async function POST(request: Request) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const submitLimit = await rateLimit(`signup:submit:${actor.uid}`, 3, 3600);
  if (!submitLimit.success) return NextResponse.json({ error: "Too many signup screening attempts. Please wait or contact Rabi for help." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((submitLimit.resetAt - Date.now()) / 1000))) } });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid signup payload" }, { status: 400 });
  }

  const name = boundedText(body.name, 80);
  const email = boundedText(body.email, 254);
  const phone = boundedText(body.phone, 24);
  const plan = boundedText(body.plan, 40);
  const location = boundedText(body.location, 120) ?? "";
  const cardNumber = boundedText(body.ghanaCardNumber, 24) ?? "";
  const documentsDeferred = body.documentsDeferred === true;
  const front = evidenceUrl(body.ghanaCardFront, !documentsDeferred);
  const back = evidenceUrl(body.ghanaCardBack, !documentsDeferred);
  const selfie = evidenceUrl(body.passportPhoto, !documentsDeferred);
  const video = evidenceUrl(body.faceScanVideo ?? "");

  if (!name || !email || email.toLowerCase() !== (actor.email ?? "").toLowerCase() ||
      !phone || !plan || front === null || back === null || selfie === null || video === null ||
      !cardNumber || typeof body.termsAccepted !== "boolean" || body.termsAccepted !== true) {
    return NextResponse.json({ error: "Signup details or document references are invalid" }, { status: 400 });
  }

  /*
   * Gate 0: the location rule, enforced on the trusted side.
   *
   * The browser hides the manual area box until three detections have failed,
   * but a browser is not a policy engine. A caller posting straight to this
   * endpoint could send `locationSource: "manual"` with no attempts at all,
   * which is the exact bypass the UI was supposed to close. The server now
   * requires the same evidence the UI requires, and marks anything it cannot
   * corroborate for review rather than silently accepting a typed address.
   */
  const LOCATION_ATTEMPT_LIMIT = 3;
  const rawAttempts = body.locationAttempts;
  const locationAttempts =
    typeof rawAttempts === "number" && Number.isFinite(rawAttempts)
      ? Math.max(0, Math.min(Math.floor(rawAttempts), 99))
      : 0;
  const locationSource = ["gps", "network", "manual", "unknown"].includes(String(body.locationSource))
    ? (String(body.locationSource) as "gps" | "network" | "manual" | "unknown")
    : "unknown";
  const typedLocation = locationSource === "manual" || locationSource === "unknown";
  if (typedLocation && !location && locationSource === "manual") {
    return NextResponse.json({ error: "Add your area before continuing." }, { status: 400 });
  }
  if (typedLocation && locationAttempts < LOCATION_ATTEMPT_LIMIT) {
    return NextResponse.json(
      {
        error:
          "We could not confirm that location detection failed three times, so your typed area cannot be accepted. Tap Detect My Location and try again, or contact Rabi.",
        code: "location-attempts-required",
        attemptsRequired: LOCATION_ATTEMPT_LIMIT,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }

  const db = await adminFirestore();
  if (!db) return NextResponse.json({ error: "Secure signup storage is unavailable" }, { status: 503 });
  const ref = db.collection("users").doc(actor.uid);
  try {
    if ((await ref.get()).exists) return NextResponse.json({ error: "A signup profile already exists for this account." }, { status: 409 });
  } catch (error) {
    console.error("[signup] existing-profile check failed", error);
    return NextResponse.json({ error: "Secure signup storage is unavailable" }, { status: 503 });
  }

  let evidenceHashes: Record<string, string> = {};
  let screeningState: "screened_pass" | "manual_review_required" | "verification_unavailable" = "manual_review_required";
  let screeningReasons = ["human-review-required"];
  let screeningChecks: Record<string, unknown> = {};
  const digests: Record<string, EvidenceDigest> = {};
  const visionConfigured = kycVisionConfigured();
  let visionResult: VisionScreening | null = null;
  if (!documentsDeferred) {
    try {
      const [frontDigest, backDigest, selfieDigest] = await Promise.all([
        hashEvidence(front as string, "image", visionConfigured),
        hashEvidence(back as string, "image", visionConfigured),
        hashEvidence(selfie as string, "image", visionConfigured),
      ]);
      digests.front = frontDigest;
      digests.back = backDigest;
      digests.selfie = selfieDigest;
      if (video) digests.video = await hashEvidence(video, "video");
      evidenceHashes = Object.fromEntries(Object.entries(digests).map(([key, digest]) => [key, digest.sha256]));
    } catch {
      // Screening/evidence transport failure is not a reason to reject signup.
      screeningState = "verification_unavailable";
      screeningReasons = ["evidence-fetch-unavailable", "manual-review-required"];
    }
  }

  /*
   * Gate 1: the AI screening verdict.
   *
   * This is the authoritative check. The upload route already refused an
   * unusable selfie in real time, but that path can be skipped by a client that
   * talks to this endpoint directly, so the same question is asked again here
   * about the files that are actually referenced in the submission.
   *
   * Three outcomes, and they are not interchangeable:
   *
   *   rejected  -> the application is refused. No Firestore record: nothing for
   *                Rabi to review, nothing for the member to "wait out".
   *   pass      -> stored as screened_pass, still pending human approval.
   *   no answer -> stored as manual_review_required. An AI outage must never
   *                be the reason a real applicant is blocked, but it must also
   *                never be recorded as a pass.
   */
  if (visionConfigured && !documentsDeferred) {
    const ready = [digests.front, digests.back, digests.selfie].every(
      (image) => image?.base64 && image.bytes <= 3 * 1024 * 1024
    );
    if (!ready) {
      screeningState = "verification_unavailable";
      screeningReasons = ["vision-evidence-unavailable", "manual-review-required"];
    } else {
      visionResult = await screenKycImages([
        { mime: digests.front.mime, base64: digests.front.base64 as string },
        { mime: digests.back.mime, base64: digests.back.base64 as string },
        { mime: digests.selfie.mime, base64: digests.selfie.base64 as string },
      ]);

      screeningChecks = {
        vision: {
          state: visionResult.state,
          provider: visionResult.provider ?? null,
          model: visionResult.model ?? null,
          reasons: visionResult.reasons,
          signals: visionResult.signals ?? null,
          durationMs: visionResult.durationMs ?? null,
          attempts: visionResult.attempts ?? [],
          at: new Date().toISOString(),
        },
      };

      if (visionResult.state === "rejected") {
        console.info("[signup] screening refused an application", {
          uid: actor.uid,
          provider: visionResult.provider,
          reasons: visionResult.reasons,
        });
        return NextResponse.json(
          {
            error: rejectionMessage(visionResult.reasons),
            code: "kyc-screening-rejected",
            reasons: visionResult.reasons,
            retryable: true,
          },
          { status: 422, headers: { "Cache-Control": "no-store" } }
        );
      }

      screeningState = visionResult.state;
      screeningReasons = [...visionResult.reasons];
    }
  } else if (!documentsDeferred) {
    // No vision key configured at all: be explicit rather than vague.
    screeningState = "verification_unavailable";
    screeningReasons = ["vision-provider-not-configured", "manual-review-required"];
  }

  const screeningBase = process.env.KYC_SCREENING_URL?.replace(/\/$/, "");
  const screeningSecret = process.env.KYC_SCREENING_SHARED_SECRET;
  if (!documentsDeferred && (!visionResult || visionResult.state === "screened_pass" || visionResult.state === "verification_unavailable") && screeningBase && screeningSecret && digests.front && digests.back && digests.selfie) {
    const createdAt = Math.floor(Date.now() / 1000);
    const screeningPayload = {
      submissionId: crypto.randomUUID().replace(/-/g, ""),
      caseId: actor.uid,
      sessionId: crypto.randomBytes(24).toString("hex"),
      createdAt,
      expiresAt: createdAt + 600,
      evidence: [
        { purpose: "card-front", deliveryUrl: front, sha256: digests.front.sha256, mime: digests.front.mime, bytes: digests.front.bytes },
        { purpose: "card-back", deliveryUrl: back, sha256: digests.back.sha256, mime: digests.back.mime, bytes: digests.back.bytes },
        { purpose: "selfie", deliveryUrl: selfie, sha256: digests.selfie.sha256, mime: digests.selfie.mime, bytes: digests.selfie.bytes },
        ...(video && digests.video ? [{ purpose: "liveness-video", deliveryUrl: video, sha256: digests.video.sha256, mime: digests.video.mime, bytes: digests.video.bytes }] : []),
      ],
    };
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
      if (value && typeof value === "object") {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
      }
      return JSON.stringify(value);
    };
    try {
      const signature = crypto.createHmac("sha256", screeningSecret).update(canonical(screeningPayload)).digest("hex");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      try {
        const response = await fetch(`${screeningBase}/v1/screen`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Screening-Signature": `sha256=${signature}` },
          body: JSON.stringify(screeningPayload),
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (response.ok && result.submissionId === screeningPayload.submissionId &&
            ["screened_pass", "manual_review_required", "verification_unavailable"].includes(String(result.state))) {
          screeningState = result.state as typeof screeningState;
          const checks = result.checks && typeof result.checks === "object" ? result.checks as Record<string, unknown> : {};
          screeningChecks = { ...screeningChecks, worker: checks };
          const workerReasons = Object.entries(checks).flatMap(([purpose, item]) => {
            const reasons = item && typeof item === "object" && Array.isArray((item as { reasons?: unknown }).reasons)
              ? (item as { reasons: unknown[] }).reasons.filter((reason): reason is string => typeof reason === "string")
              : [];
            return reasons.map((reason) => `${purpose}:${reason}`);
          }).slice(0, 30);
          screeningReasons = [...screeningReasons, ...workerReasons].slice(0, 30);
          if (String(screeningState) === "screened_pass") screeningReasons.push("screening-only-human-review-required");
        } else {
          screeningState = "verification_unavailable";
          screeningReasons = [...screeningReasons, "screening-service-unavailable", "manual-review-required"].slice(0, 30);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      screeningState = "verification_unavailable";
      screeningReasons = [...screeningReasons, "screening-service-unavailable", "manual-review-required"].slice(0, 30);
    }
  } else if (!documentsDeferred && !visionResult && screeningState === "manual_review_required" && screeningReasons.includes("human-review-required")) {
    screeningReasons = ["screening-service-not-configured", "manual-review-required"];
  }

  try {
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) throw new Error("application-exists");
      transaction.create(ref, {
        name,
        email,
        phone,
        location,
        plan,
        plans: [plan],
        ghanaCardNumber: cardNumber,
        ghanaCardFront: front,
        ghanaCardBack: back,
        passportPhoto: selfie,
        faceScanVideo: video,
        documentsDeferred: body.documentsDeferred === true,
        gpsLat: typeof body.gpsLat === "number" && Number.isFinite(body.gpsLat) ? body.gpsLat : 0,
        gpsLng: typeof body.gpsLng === "number" && Number.isFinite(body.gpsLng) ? body.gpsLng : 0,
        gpsAddress: boundedText(body.gpsAddress, 300) ?? "Unknown, pending",
        locationSource,
        locationAccuracy: typeof body.locationAccuracy === "number" && Number.isFinite(body.locationAccuracy)
          ? body.locationAccuracy
          : null,
        locationReview: body.locationReview !== false || typedLocation,
        locationAttempts,
        status: "pending",
        kycReviewStatus: "manual_review_required",
        kycScreeningState: screeningState,
        kycScreeningReasons: screeningReasons,
        kycScreeningChecks: screeningChecks,
        kycScreeningModelVersion: "advisory-screening-v2",
        kycReviewReason: body.documentsDeferred === true
          ? "Documents promised on WhatsApp; human verification required"
          : String(screeningState) === "screened_pass"
            ? "Automated screening signals recorded; explicit human review still required"
            : screeningReasons.join(", "),
        kycSubmittedAt: FieldValue.serverTimestamp(),
        kycPolicyVersion: "kyc-review-1",
        kycSubmissionVersion: crypto.randomUUID(),
        evidenceHashes,
        termsAccepted: true,
        termsAcceptedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        whatsappLink: "",
      });
    });
    return NextResponse.json({ ok: true, status: "pending", kycReviewStatus: "manual_review_required", screeningState }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "application-exists") {
      return NextResponse.json({ error: "An application already exists for this account" }, { status: 409 });
    }
    console.error("[signup] secure application write failed:", (error as Error).message);
    return NextResponse.json({ error: "Could not securely save the application" }, { status: 503 });
  }
}
