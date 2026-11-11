import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { UPLOAD_FOLDER } from "@/lib/file-kind";
import { authenticateRequest } from "@/lib/server-auth";
import { adminFirestore } from "@/lib/server-firestore";
import { kycVisionConfigured, screenKycImages, type VisionScreening } from "@/lib/kyc-vision";
import { rejectionMessage } from "@/lib/kyc-vision-policy";
import { screenDeterministically, readCardIdentity } from "@/lib/kyc-deterministic";
import { checkIdentityAgainstCard } from "@/lib/kyc-identity-check";
import { assessCardRisk, type CardRiskAssessment } from "@/lib/kyc-fraud-signals";
import { dHashFromGrid, hashDistance, SAME_IMAGE_DISTANCE } from "@/lib/perceptual-hash";
import { decodeToGrid } from "@/lib/kyc-deterministic";
import { validateGhanaCardFormat } from "@/lib/ghana-card";
import { digitsOf } from "@/lib/mrz";
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
 * A sentence a member can act on when the deterministic checks refuse them.
 *
 * Written separately from the AI copy because the causes are different: an MRZ
 * checksum is about the physical card, not about lighting.
 */
function deterministicRejectionMessage(reasons: string[]): string {
  const joined = reasons.join(" ");
  if (joined.includes("no-human-skin") || joined.includes("face-region")) {
    return "That selfie does not show your face. Take it live, with the camera, facing the lens in good light. Photos of a document, a screen, a wall or an object cannot be used.";
  }
  if (joined.includes("mrz-checksum-failed") || joined.includes("no-machine-readable-zone")) {
    return "We could not confirm the strip on the back of your Ghana Card. Photograph the back of your own card, flat, filling the frame, with no glare over the strip.";
  }
  if (joined.includes("typed-pin-does-not-match-mrz")) {
    return "The card number you typed does not match the card in your photos. Check the number and use your own card.";
  }
  if (joined.includes("card-not-landscape") || joined.includes("card-not-card-shaped")) {
    return "That does not look like a photograph of a card. Lay your Ghana Card flat, fill the frame, and photograph it the wide way round.";
  }
  return "We could not accept those photos. Please take them again with the camera, in good light.";
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
  /*
   * The card number is no longer typed by the member.
   *
   * It is read from the machine-readable zone on the back of the card further
   * down. A caller may still send one (an older build of the app does), and it is
   * used only as corroboration — never as the thing the card is checked against,
   * because comparing a card to itself proves nothing.
   */
  const suppliedCardNumber = boundedText(body.ghanaCardNumber, 24) ?? "";
  let cardNumber = suppliedCardNumber;
  /** The nine digits printed in the card's own machine-readable zone. */
  let mrzCardNumber = "";
  /*
   * The legal name is collected on step one now, so the card can be compared
   * against something the applicant wrote before they ever saw it.
   */
  const typedIdentity = {
    firstName: boundedText(body.firstName, 80) ?? "",
    lastName: boundedText(body.lastName, 80) ?? "",
    previousNames: boundedText(body.previousNames, 120) ?? "",
    otherNames: boundedText(body.otherNames, 120) ?? "",
    dateOfBirth: boundedText(body.dateOfBirth, 10) ?? "",
    sex: boundedText(body.sex, 20) ?? "",
    nationality: boundedText(body.nationality, 40) ?? "",
    placeOfIssuance: boundedText(body.placeOfIssuance, 60) ?? "",
  };
  const documentsDeferred = body.documentsDeferred === true;
  const front = evidenceUrl(body.ghanaCardFront, !documentsDeferred);
  const back = evidenceUrl(body.ghanaCardBack, !documentsDeferred);
  const selfie = evidenceUrl(body.passportPhoto, !documentsDeferred);
  const video = evidenceUrl(body.faceScanVideo ?? "");

  if (!name || !email || email.toLowerCase() !== (actor.email ?? "").toLowerCase() ||
      !phone || !plan || front === null || back === null || selfie === null || video === null ||
      typeof body.termsAccepted !== "boolean" || body.termsAccepted !== true) {
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
  /**
   * Everything the screening recorded, keyed by check.
   *
   * Typed loosely for the Firestore record but the identity entry is held
   * separately as well, because the two things stored from it — the outcome and
   * the sentence Rabi reads — must be written even though the rest is opaque.
   */
  let screeningChecks: Record<string, unknown> = {};
  let identityRecord: { outcome: string; sentence: string } = { outcome: "not-checked", sentence: "" };
  /**
   * The 8-byte perceptual hashes of the three images, as hex.
   *
   * Kept beside `evidenceHashes` rather than inside it because they answer a
   * different question: SHA-256 identifies a file, dHash identifies a picture.
   * A stolen card re-encoded through WhatsApp changes the first and not the
   * second.
   */
  let perceptualHashes: Record<string, string> = {};
  /** The collision the duplicate check found, if any. */
  let duplicateOf: { hash: string; field: string } | null = null;
  /** The outcome of the two-signal rule, written to the record for Rabi. */
  let risk: CardRiskAssessment | null = null;
  /** The card lock this submission tried to claim. */
  let cardLockId: string | null = null;
  /** True when vision said the evidence came off a screen. */
  let screenPhoto = false;
  /**
   * The name comparison's verdict, lifted out of the block that computes it.
   *
   * `identity` is scoped to the gate that produced it, and the risk rule runs
   * later. Carrying the one field it needs is clearer than re-deriving it from
   * the outcome string, which conflates "name matched" with "dob matched".
   */
  let nameVerdict: "match" | "partial" | "mismatch" | "inconclusive" = "inconclusive";
  const digests: Record<string, EvidenceDigest> = {};
  const visionConfigured = kycVisionConfigured();
  let visionResult: VisionScreening | null = null;
  if (!documentsDeferred) {
    try {
      const [frontDigest, backDigest, selfieDigest] = await Promise.all([
        /*
         * Always keep the bytes, not just the hash. The deterministic screener
         * decodes them locally; when it had to fetch them from Cloudinary there
         * was a second network hop that could fail, and a failed hop used to
         * mean "not screened" rather than "not accepted".
         */
        hashEvidence(front as string, "image", true),
        hashEvidence(back as string, "image", true),
        hashEvidence(selfie as string, "image", true),
      ]);
      digests.front = frontDigest;
      digests.back = backDigest;
      digests.selfie = selfieDigest;
      if (video) digests.video = await hashEvidence(video, "video");
      evidenceHashes = Object.fromEntries(Object.entries(digests).map(([key, digest]) => [key, digest.sha256]));

      /*
       * The perceptual hash, computed from the bytes already in memory.
       *
       * A failure here is not a failure of the application. `dHashFromGrid`
       * returns null for an image it cannot decode to a grid, and that is
       * recorded as "unknown" rather than "new" — the difference matters,
       * because "unknown" must never be counted as evidence that the image is
       * original.
       */
      for (const [field, digest] of Object.entries(digests)) {
        if (field === "video" || !digest.base64) continue;
        try {
          const grid = await decodeToGrid(Buffer.from(digest.base64, "base64"));
          const hash = dHashFromGrid(grid);
          if (hash) perceptualHashes[field] = hash;
        } catch {
          /* unreadable image: leave the field absent rather than guess */
        }
      }
    } catch {
      /*
       * The evidence could not be downloaded at all. Previously this was treated
       * as "not screened, carry on", which meant a submission whose photos were
       * unreachable reached Rabi with nothing examined — and a spoofed one looked
       * identical to a real one. If we cannot see the documents, we cannot
       * accept a submission that claims to have them.
       */
      console.error("[signup] evidence could not be retrieved for screening", { uid: actor.uid });
      return NextResponse.json(
        {
          error:
            "We could not read the photos you uploaded. Check your connection and submit again, or contact Rabi on WhatsApp.",
          code: "kyc-evidence-unavailable",
          retryable: true,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  /*
   * Gate 0.5: the deterministic verdict.
   *
   * Runs before any model is asked anything, on the files actually referenced by
   * this submission. It is the check that cannot be talked out of a decision: an
   * MRZ whose ICAO check digits do not compute, a card number that disagrees
   * with the one the applicant typed, or a selfie containing no skin are all
   * facts about the bytes, not opinions.
   *
   * Only a `rejected` verdict stops the submission here. Anything the checks
   * could not read falls through to the AI and then to Rabi, so a bad camera is
   * never treated as fraud.
   */
  if (!documentsDeferred && digests.front && digests.back && digests.selfie) {
    const deterministic = await screenDeterministically({
      front: { url: front as string, bytes: digests.front.base64 ? Buffer.from(digests.front.base64, "base64") : undefined },
      back: { url: back as string, bytes: digests.back.base64 ? Buffer.from(digests.back.base64, "base64") : undefined },
      selfie: {
        url: selfie as string,
        bytes: digests.selfie.base64 ? Buffer.from(digests.selfie.base64, "base64") : undefined,
      },
      // Empty on a fresh client; `matchTypedPin` reports "not possible" rather
      // than a failure when there is nothing to compare.
      typedPin: cardNumber || suppliedCardNumber,
    });

    screeningChecks = { ...screeningChecks, deterministic: deterministic.checks };

    if (deterministic.state === "rejected") {
      console.info("[signup] deterministic screening refused an application", {
        uid: actor.uid,
        reasons: deterministic.reasons,
      });
      return NextResponse.json(
        {
          error: deterministicRejectionMessage(deterministic.reasons),
          code: "kyc-screening-rejected",
          reasons: deterministic.reasons,
          retryable: true,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (deterministic.state === "manual_review_required" || deterministic.state === "verification_unavailable") {
      screeningReasons = [...screeningReasons, ...deterministic.reasons].slice(0, 40);
    }

    /*
     * Does the card belong to the person who applied?
     *
     * The MRZ on the back is the only identity data a photographed Ghana Card
     * gives up reliably, and it carries the holder's name, date of birth and sex.
     * Those are compared with what the member typed on step one.
     *
     * A disagreement never blocks the application. It is recorded, it becomes a
     * sentence on Rabi's screen, and she decides — because the alternative is
     * refusing a citizen whose married name is on the card, and that has to be
     * the worse outcome.
     */
    const cardIdentity = await readCardIdentity(
      digests.back.base64 ? Buffer.from(digests.back.base64, "base64") : null
    );
    const identity = checkIdentityAgainstCard(typedIdentity, cardIdentity);
    screeningChecks = { ...screeningChecks, identity };
    identityRecord = { outcome: identity.outcome, sentence: identity.sentence };
    nameVerdict = identity.name.verdict;

    /*
     * Store the card's own number, not a typed one.
     *
     * The member no longer types it, so the only trustworthy source is the MRZ.
     * A number that was sent is kept only when the card confirmed it — otherwise
     * the application would record a number nobody verified. When the MRZ could
     * not be read the field stays empty and says so, which is honest, rather than
     * storing digits of unknown provenance in an identity record.
     */
    if (cardIdentity) {
      const mrzDigits = (cardIdentity.documentNumber ?? "").replace(/\D/g, "");
      /*
       * A card whose number cannot be read cannot be locked.
       *
       * That is deliberate: a lock keyed on a partial or misread number would
       * either collide with a different citizen's card or be trivially evaded by
       * scratching the back. The absence is recorded so Rabi knows this
       * application is not covered by the one-card-one-account rule, instead of
       * assuming that a missing lock means the check passed.
       */
      if (mrzDigits.length < 9) {
        screeningReasons = Array.from(
          new Set([...screeningReasons, "card-lock-not-possible-number-unreadable"])
        ).slice(0, 40);
      }
      if (mrzDigits.length >= 9) {
        const cardDigits = mrzDigits.slice(-9);
        mrzCardNumber = cardDigits;
        /*
         * Do NOT rebuild the printed PIN from the MRZ check digit.
         *
         * The obvious-looking `GHA-${cardDigits}-${mrzCheckDigit(cardDigits)}`
         * was tried and is wrong: for the genuine card in the test fixtures the
         * MRZ carries check digit 9 while the card is printed GHA-002089279-3.
         * Ghana's printed check digit is not the ICAO one, so computing it would
         * put a number in the identity record that no card in the country
         * carries — a fabricated identifier, worse than a missing one.
         *
         * So the printed number is kept only when a client sent one and its nine
         * digits agree with the card. Otherwise the field is left empty and the
         * MRZ digits are recorded separately, under a name that says what they are.
         */
        if (validateGhanaCardFormat(suppliedCardNumber) && digitsOf(suppliedCardNumber).includes(cardDigits)) {
          cardNumber = suppliedCardNumber.toUpperCase();
        }

        /*
         * The lock id, from the MRZ digits rather than the printed PIN.
         *
         * The check digit is deliberately excluded: it is a function of the
         * other digits, so including it adds nothing, and different readers
         * disagree about whether Ghana's printed check digit is the ICAO one
         * (it is not). Nine digits of payload are the stable part.
         */
        cardLockId = crypto.createHash("sha256").update(`gha-mrz:${cardDigits}`).digest("hex");
      }
    }

    if (identity.outcome === "inconsistent") {
      screeningReasons = [...screeningReasons, `identity-${identity.name.verdict}`, `identity-dob-${identity.dateOfBirth}`].slice(0, 40);
      console.info("[signup] typed name does not match the card", {
        uid: actor.uid,
        outcome: identity.outcome,
        cardName: identity.detail.cardName,
      });
    }
  }

  /*
   * Gate 0.5: gather the fraud evidence.
   *
   * This block collects facts; the verdict is taken later, after vision, and
   * written by `assessCardRisk`. Only one thing is decided here — whether this
   * picture has been used on another application — and even that is reported,
   * never acted on alone.
   */
  if (!documentsDeferred) {
    /*
     * Look for a reused picture among submissions already stored.
     *
     * Bounded to the last 30 days and 200 applications, which is a single
     * indexed query and runs once per signup. It is enough to catch a ring
     * working within a season; a fraudster who spreads reuse across months or
     * keeps under the cap defeats it. That limitation is real and is recorded
     * in docs/KYC-HARDENING-PLAN.md rather than left implicit here.
     *
     * A failure is not evidence of anything: the catch below records it and the
     * submission proceeds to Rabi exactly as it would have.
     */
    try {
      const recent = await db
        .collection("users")
        .where("kycSubmittedAt", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .limit(200)
        .get();

      const known: { hash: string; field: string; uid: string }[] = [];
      recent.forEach((snapshot) => {
        if (snapshot.id === actor.uid) return;
        const stored = snapshot.get("kycPerceptualHashes") as Record<string, string> | undefined;
        if (!stored) return;
        for (const [field, hash] of Object.entries(stored)) {
          if (typeof hash === "string") known.push({ hash, field, uid: snapshot.id });
        }
      });

      for (const [field, hash] of Object.entries(perceptualHashes)) {
        const match = known.find((candidate) => {
          const distance = hashDistance(hash, candidate.hash);
          return distance !== null && distance <= SAME_IMAGE_DISTANCE;
        });
        if (match) {
          duplicateOf = { hash: match.hash, field };
          break;
        }
      }
    } catch (error) {
      /*
       * A failed lookup is not evidence of anything. It is recorded so the gap
       * is visible, and the submission proceeds to Rabi as it would have.
       */
      console.warn("[signup] duplicate-image check could not run", { uid: actor.uid, error: (error as Error).message });
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

      /*
       * Lift the screen finding out of the vision result before the rejection
       * branch, so it reaches the risk rule whether the model refused or merely
       * flagged. `classifyVisionSignals` sets it for card scope without
       * rejecting, which is exactly the case the owner wanted Rabi to see.
       */
      screenPhoto = visionResult.screenPhoto === true ||
        visionResult.reasons.some((reason) => /photo-of-a-screen|card-is-a-photo-of-a-screen/i.test(reason));

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

 else if (!documentsDeferred && !visionResult && screeningState === "manual_review_required" && screeningReasons.includes("human-review-required")) {
    screeningReasons = ["screening-service-not-configured", "manual-review-required"];
  }

  /*
   * Gate 1.5: the two-signal decision, now that every input exists.
   *
   * Vision has run by this point, so `screenPhoto`, the template finding, the
   * MRZ result and the name comparison are all known. This is the only place a
   * machine is allowed to refuse without asking Rabi, and it may do so only
   * when two independent signals agree.
   */
  if (!documentsDeferred) {
    const deterministicChecks = screeningChecks.deterministic as
      | Record<string, { status?: string }>
      | undefined;

    risk = assessCardRisk({
      nameMatch: nameVerdict,
      templateDetected: deterministicChecks?.["card-template"]?.status === "fail",
      duplicateImage: duplicateOf !== null,
      liveCapture: body.selfieCaptureMode === "live-camera",
      screenPhoto,
      mrzInvalid: deterministicChecks?.["card-mrz"]?.status === "inconclusive",
    });

    screeningChecks = { ...screeningChecks, risk };

    if (risk.decision === "auto-refuse") {
      console.info("[signup] refused on two independent signals", {
        uid: actor.uid,
        signals: risk.signals,
      });
      return NextResponse.json(
        {
          error:
            "We could not accept these documents. More than one independent check found a problem with them, so this application cannot continue automatically. Message Rabi on WhatsApp if you believe this is a mistake.",
          code: "kyc-documents-refused",
          reasons: risk.signals,
          retryable: false,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (risk.decision === "flag-for-review") {
      screeningReasons = Array.from(new Set([...screeningReasons, ...risk.signals])).slice(0, 40);
    }
  }

  try {
    /*
     * Annotated for the same reason as the decision route: the SDK's inferred
     * generic for this callback resolved to `any` on CI and failed
     * `noImplicitAny` there while passing locally. Naming the type removes the
     * dependency on inference entirely.
     */
    await db.runTransaction(async (transaction: Transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) throw new Error("application-exists");

      /*
       * One Ghana Card, one account.
       *
       * The lock is keyed on a SHA-256 of the MRZ document number, never the
       * printed PIN. Two reasons: the MRZ number is what the ICAO checksums
       * already validated, so it is the trustworthy identifier; and hashing it
       * means neither the collection ids nor the rules ever carry a citizen's
       * real card number.
       *
       * It is read and written inside this transaction so two applications
       * racing on the same card cannot both win. A separate read-then-write
       * would leave exactly the window a fraud ring needs.
       *
       * The stored record keeps `{ uid, createdAt }` by the owner's explicit
       * decision, so Rabi can see *which* account holds the card and tell a
       * stolen identity from a spouse sharing one. It is server-written only;
       * the rules deny all client access.
       */
      if (cardLockId) {
        const lockRef = db.collection("cardLocks").doc(cardLockId);
        const lock = await transaction.get(lockRef);
        if (lock.exists) {
          const holder = lock.get("uid");
          if (holder && holder !== actor.uid) {
            throw new Error(`card-already-claimed:${holder}`);
          }
        } else {
          transaction.create(lockRef, {
            uid: actor.uid,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      transaction.create(ref, {
        name,
        email,
        phone,
        location,
        plan,
        plans: [plan],
        /*
         * The legal identity, stored beside the card it was checked against, so
         * Rabi can put the two side by side without opening the images. The
         * outcome sentence is stored too: it is what she reads first.
         */
        firstName: typedIdentity.firstName,
        lastName: typedIdentity.lastName,
        otherNames: typedIdentity.otherNames,
        previousNames: typedIdentity.previousNames,
        dateOfBirth: typedIdentity.dateOfBirth,
        sex: typedIdentity.sex,
        nationality: typedIdentity.nationality,
        placeOfIssuance: typedIdentity.placeOfIssuance,
        kycIdentityOutcome: identityRecord.outcome,
        kycIdentitySentence: identityRecord.sentence,
        ghanaCardNumber: cardNumber,
        /*
         * The verified identifier. `ghanaCardNumber` above may be empty on a
         * fresh client, so screens that need "the card's number" read this.
         */
        ghanaCardMrzNumber: mrzCardNumber,
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
        /*
         * The perceptual hashes, so a future application can be compared with
         * this one. Stored beside the SHA-256 rather than instead of it: the
         * first answers "same file", the second answers "same picture".
         */
        kycPerceptualHashes: perceptualHashes,
        /** How the selfie was obtained: live camera, or the no-camera fallback. */
        kycSelfieCaptureMode:
          typeof body.selfieCaptureMode === "string" ? body.selfieCaptureMode.slice(0, 40) : "",
        /** The two-signal rule's verdict, with the reasons Rabi reads. */
        kycRiskDecision: risk?.decision ?? "accept-for-review",
        kycRiskSignals: risk?.signals ?? [],
        kycRiskSentence: risk?.sentence ?? "",
        /** The card lock this application holds, if the MRZ could be read. */
        kycCardLock: cardLockId ?? "",
        /** The loud flag for a photographed screen, kept separate so it sorts. */
        kycScreenPhoto: screenPhoto,
        kycDuplicateOf: duplicateOf ?? null,
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
    /*
     * The card is already claimed by a different account.
     *
     * Deliberately a 409 with a plain sentence and no mention of *who* holds it.
     * The owner needs to see the link (the lock document carries `uid`), but the
     * applicant must not be told another person's account id, and a fraudster
     * must not learn from the response whether the card is real and simply
     * already used. `kycCardLockConflicts` records the attempt for her.
     */
    if (error instanceof Error && error.message.startsWith("card-already-claimed:")) {
      const holder = error.message.slice("card-already-claimed:".length);
      console.info("[signup] card already claimed by another account", {
        uid: actor.uid,
        holder,
        lock: cardLockId,
      });
      try {
        await db.collection("cardLockAttempts").add({
          uid: actor.uid,
          holder,
          cardLock: cardLockId,
          at: FieldValue.serverTimestamp(),
        });
      } catch {
        /* the refusal stands even if the audit write fails */
      }
      return NextResponse.json(
        {
          error:
            "This Ghana Card is already linked to another account. If this card is yours, message Rabi on WhatsApp and she will sort it out.",
          code: "card-already-claimed",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    console.error("[signup] secure application write failed:", (error as Error).message);
    return NextResponse.json({ error: "Could not securely save the application" }, { status: 503 });
  }
}
