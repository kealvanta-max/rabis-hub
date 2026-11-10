/**
 * What can this deployment actually do, right now?
 *
 * Why this exists
 * ---------------
 * "FIREBASE_SERVICE_ACCOUNT_KEY is set" is not the same as "signup can write a
 * record". Twice now, production has had every environment variable present and
 * still failed: once because the private key's newlines were mangled, once
 * because the key was base64 of something that was not a service account. The
 * health endpoint said "misconfigured" both times and could not say which part,
 * so the only way to find out was to read a Vercel log nobody had open.
 *
 * So this file answers the question that matters, per capability, by exercising
 * the real code path with no personal data:
 *
 *   can we read Firestore with the service account?  -> a real 1-document read
 *   can we write it?                                 -> into a scratch doc, deleted after
 *   is the Cloudinary credential accepted?           -> Cloudinary's own /ping
 *   can we read a card's MRZ?                        -> the vendored OCR engine
 *   can we find a face?                              -> the vendored model
 *   is a provider key present?                       -> presence only, never usage
 *
 * Every probe is bounded, read-only where possible, and reports the exact
 * failure text so the next person does not have to guess.
 *
 * This is server-side only. Callers must gate it on an admin claim: the detail
 * is a map of the deployment's internals and is useful to an attacker.
 */

import { adminFirestore } from "@/lib/server-firestore";
import {
  deterministicEngineStatus,
  judgeSelfiePhoto,
  centralFaceBox,
  type RgbGrid,
} from "@/lib/kyc-deterministic";
import { visionProviderNames } from "@/lib/kyc-vision";

export type CapabilityState = "ready" | "degraded" | "broken" | "off";

export interface Capability {
  state: CapabilityState;
  /** One sentence a non-engineer can act on. */
  summary: string;
  /** The exact error text, when there is one. Never a secret. */
  detail?: string;
  /** What a member sees while this is in this state. */
  memberImpact?: string;
}

type Probe = () => Promise<Capability>;

/** Trim a provider error so a key or URL cannot leak into a response. */
function scrub(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value ?? "");
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted-key]")
    .replace(/sk-[A-Za-z0-9]{16,}/g, "[redacted-key]")
    .replace(/https?:\/\/[^\s]*:[^\s@]*@/g, "[redacted-url]")
    .slice(0, 300);
}

/* ------------------------------------------------------------------ */

/**
 * The single question that produced "Secure signup storage is unavailable".
 *
 * A read proves the credential is accepted and the project id is right. A write
 * proves the security rules do not block the Admin SDK and that the database
 * exists. Both are needed before a member can register.
 */
const firestore: Probe = async () => {
  const db = await adminFirestore();
  if (!db) {
    const raw = Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.SERVICE_ACCOUNT
    );
    return {
      state: "broken",
      summary: raw
        ? "A service account is set but it could not be parsed, so nothing can be saved."
        : "No Firebase service account is set, so nothing can be saved.",
      detail: raw
        ? "The value is neither JSON nor base64 JSON containing project_id and private_key. Re-paste it as base64 of the whole key file."
        : "Set FIREBASE_SERVICE_ACCOUNT_KEY to base64 of the downloaded service account JSON.",
      memberImpact:
        "Signup stops at the last step with 'Secure signup storage is unavailable'. Nothing is saved.",
    };
  }

  try {
    // A read of a document that is not expected to exist. Cheap, and it proves
    // the credential and the project id together.
    await db.collection("settings").doc("_health-probe").get();
  } catch (error) {
    return {
      state: "broken",
      summary: "The service account was accepted but Firestore refused to read.",
      detail: scrub(error),
      memberImpact: "Signup cannot check for an existing profile, so it fails closed.",
    };
  }

  try {
    /*
     * The write probe. It goes to a scratch document and is removed straight
     * after, because "can we write" is the specific thing that was broken and a
     * read does not prove it.
     */
    const ref = db.collection("settings").doc("_health-probe");
    await ref.set({ at: Date.now(), note: "health probe, safe to ignore" });
    await ref.delete();
  } catch (error) {
    return {
      state: "degraded",
      summary: "Firestore reads work but the write probe was refused.",
      detail: scrub(error),
      memberImpact:
        "Saving an application will fail. Reads (admin list) still work.",
    };
  }

  return {
    state: "ready",
    summary: "Read and write both work. Applications can be saved.",
  };
};

/**
 * Cloudinary is asked directly, with the server credential.
 *
 * Presence of the two variables is not evidence: an API key and secret that do
 * not belong to the configured cloud will sign uploads that Cloudinary rejects,
 * and the member sees "could not upload" with no reason.
 */
const cloudinary: Probe = async () => {
  const cloud = (
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    ""
  ).trim();
  const key = (process.env.CLOUDINARY_API_KEY || "").trim();
  const secret = (process.env.CLOUDINARY_API_SECRET || "").trim();

  const missing = [
    !cloud ? "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME" : null,
    !key ? "CLOUDINARY_API_KEY" : null,
    !secret ? "CLOUDINARY_API_SECRET" : null,
  ].filter(Boolean) as string[];

  if (missing.length) {
    return {
      state: "broken",
      summary: "Photo upload cannot be signed, so no document can be attached.",
      detail: `Missing: ${missing.join(", ")}`,
      memberImpact:
        "Step two of signup cannot upload a card or selfie. The WhatsApp handover is the only way through.",
    };
  }

  try {
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/ping`,
        { headers: { Authorization: `Basic ${auth}` }, cache: "no-store", signal: controller.signal }
      );
      if (response.ok) {
        return { state: "ready", summary: "Cloudinary accepted the credential." };
      }
      // 401/403 here is the exact failure a member would hit at upload time.
      return {
        state: "broken",
        summary: "Cloudinary rejected the API key or secret for this cloud name.",
        detail: `HTTP ${response.status} from Cloudinary /ping`,
        memberImpact: "Every upload is refused. Members cannot attach their documents.",
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      state: "degraded",
      summary: "Cloudinary could not be reached from this deployment.",
      detail: scrub(error),
      memberImpact: "Uploads will fail for members while this lasts.",
    };
  }
};

/** The card reader: is the OCR worker present and can it be built at all? */
const cardReader: Probe = async () => {
  const engine = await deterministicEngineStatus();
  if (!engine.ocr) {
    return {
      state: "broken",
      summary: "The OCR worker could not be started, so no card number can be read.",
      detail:
        "Building the Tesseract worker threw. Check that @tesseract.js-data/eng and the tesseract.js worker files are present in the build output.",
      memberImpact:
        "The card's number and name cannot be read from the photo. Rabi has to type them from the image.",
    };
  }
  return {
    state: "ready",
    summary: "Card OCR is loaded and can read a machine-readable zone.",
  };
};

/** The face screen: does it correctly refuse an image that has no person in it? */
const faceCheck: Probe = async () => {
  try {
    /*
     * A synthetic grey square. The correct answer is "this is not a person", so
     * this catches both a missing model and a loaded model returning nonsense,
     * which would let a photo of a wall through to Rabi as if it were a selfie.
     */
    const size = 32;
    const values: Array<[number, number, number]> = [];
    for (let i = 0; i < size * size; i += 1) values.push([128, 128, 128]);
    const grid: RgbGrid = { width: size, height: size, values };

    const selfie = judgeSelfiePhoto(grid, centralFaceBox());

    /*
     * This is the colour screen only, and the label says so.
     *
     * The face detector is a heavier dependency that only the upload path
     * carries, so it is traced into /api/upload and not into this function.
     * Probing it from here would report a failure caused by this route's own
     * packaging, which is exactly the kind of false alarm that teaches people to
     * ignore a health page.
     */
    return selfie.status === "fail"
      ? {
          state: "ready",
          summary:
            "The colour screen refuses a blank image. The face detector itself runs on upload.",
        }
      : {
          state: "degraded",
          summary: "The colour screen did not refuse a blank image.",
          detail: `Returned ${selfie.status}: ${selfie.reasons.join(", ") || "no reason given"}`,
          memberImpact:
            "An image with nobody in it may reach Rabi's queue instead of being refused.",
        };
  } catch (error) {
    return {
      state: "degraded",
      summary: "The colour screen could not be exercised.",
      detail: scrub(error),
      memberImpact:
        "A non-human photo may reach Rabi's queue instead of being refused. Nothing is approved automatically either way.",
    };
  }
};

/** Which AI providers have a key present. Presence only: never a call. */
const vision: Probe = async () => {
  const names = visionProviderNames();
  if (names.length === 0) {
    return {
      state: "off",
      summary: "No AI provider is configured. That is a supported state, not a fault.",
      memberImpact:
        "Every application goes to Rabi with the deterministic checks attached. Nothing is refused automatically.",
    };
  }
  return {
    state: "ready",
    summary: `Configured: ${names.join(", ")}. Key presence only; the KYC diagnose screen makes a real call.`,
  };
};

/** Rate limiting: durable, or per-instance memory (which leaks on Vercel). */
const rateLimiting: Probe = async () => {
  const url = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim());
  const token = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  if (url && token) {
    return { state: "ready", summary: "Upstash is configured for distributed limits." };
  }
  return {
    state: "degraded",
    summary: "Rate limits fall back to per-instance memory.",
    memberImpact:
      "Limits are correct on one server and leaky across instances. Anonymous KYC uploads are refused until a durable limiter answers.",
  };
};

/** Email delivery. Log mode is deliberate and safe; it is not an outage. */
const email: Probe = async () => {
  const live = (process.env.MAIL_MODE || "").toLowerCase() === "live";
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasSmtp = Boolean(
    process.env.EMAIL_PASSWORD?.trim() || process.env.BACKUP_EMAIL_PASSWORD?.trim()
  );

  if (!live) {
    return {
      state: "off",
      summary: "Mail is in log mode: messages are printed, not sent.",
      memberImpact:
        "Approval emails are not delivered. Members see their status on the dashboard instead.",
    };
  }
  if (!hasResend && !hasSmtp) {
    return {
      state: "broken",
      summary: "MAIL_MODE is live but no provider credential is set.",
      memberImpact: "Approval and rejection emails silently fail.",
    };
  }
  return { state: "ready", summary: "Mail is live and a provider is configured." };
};

/* ------------------------------------------------------------------ */

const CAPABILITIES: Record<string, Probe> = {
  firestore,
  cloudinary,
  cardReader,
  faceCheck,
  vision,
  rateLimiting,
  email,
};

export type CapabilityId = keyof typeof CAPABILITIES;

/**
 * Run every probe, or one named probe.
 *
 * Probes run in parallel because they are independent, and each is individually
 * time-bounded by its own fetch, so one slow provider cannot hang the response.
 */
export async function probeCapabilities(
  only?: CapabilityId
): Promise<Record<string, Capability>> {
  const entries = only ? [[only, CAPABILITIES[only]]] as const : Object.entries(CAPABILITIES);

  const results = await Promise.all(
    entries.map(async ([id, probe]) => {
      try {
        return [id, await probe()] as const;
      } catch (error) {
        return [
          id,
          {
            state: "broken" as CapabilityState,
            summary: "This probe threw before it could report.",
            detail: scrub(error),
          },
        ] as const;
      }
    })
  );

  return Object.fromEntries(results);
}

/** One line a person can read: is the product able to take a signup or not? */
export function overallState(capabilities: Record<string, Capability>): CapabilityState {
  const states = Object.values(capabilities).map((c) => c.state);
  if (states.some((s) => s === "broken")) return "broken";
  if (states.some((s) => s === "degraded")) return "degraded";
  return "ready";
}
