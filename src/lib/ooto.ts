/**
 * OOTO AI, server side only.
 *
 * Four endpoints, all multipart, all authenticated with APP-ID + APP-KEY:
 *
 *   POST /api/v1.0/liveness?check_deepfake=true   photo   face + liveness + deepfake
 *   POST /api/v1.0/video/liveness                 video   liveness
 *   POST /api/v1.0/recognize                      image   document OCR only
 *   POST /api/v1.0/doc/compare                    iddoc + selfie   match + OCR
 *
 * This is the piece the on-device model could not give us. The MediaPipe check
 * runs in the member's browser, so a phone that refuses to run it, or a member
 * who interferes with it, decides the outcome. Here the verdict comes from a
 * server that never saw the phone.
 *
 * The engine returns HTTP 400 with a numeric code for anything it cannot read,
 * and code 5 is "can not detect face". A photograph of a dog lands there, which
 * is exactly the case that used to reach the review queue.
 *
 * Credentials are never sent to the browser: every call happens in a route
 * handler.
 */

const BASE = "https://cloud.ooto-ai.com/api/v1.0";

const IMAGE_TIMEOUT_MS = 25_000;
const VIDEO_TIMEOUT_MS = 60_000;

/** Engine codes that mean "this is not a usable face or document". */
const CODE_MESSAGES: Record<number, string> = {
  1: "That photo was empty. Take it again.",
  2: "That file type is not supported. Use a JPG or PNG photo.",
  3: "That photo was empty. Take it again.",
  4: "That photo could not be opened. Take it again.",
  5: "No human face was found in that photo. Your selfie must be a real person, only you, facing the camera. Photos of animals, objects or screens are rejected.",
  6: "More than one face is in that photo. Your selfie must show only you.",
  8: "The portrait on the card does not match the selfie.",
  9: "That photo is too small or too blurry to check. Move closer and take it again.",
  201: "That does not look like a Ghana Card. Fill the frame with the whole card and try again.",
  202: "More than one document is in that photo. Photograph only your card.",
  203: "We could not read the text on that card. Hold the camera still, avoid glare and try again.",
  204: "That photo was empty. Take it again.",
  205: "That file type is not supported. Use a JPG or PNG photo.",
  206: "That photo was empty. Take it again.",
  207: "That photo could not be opened. Take it again.",
  208: "We could not find a portrait on that card. Photograph the front of the card, which has your picture.",
  209: "That photo is too low resolution. Take it again, closer.",
};

export type OotoCheck = "selfie" | "card" | "video" | "match";

export interface OotoVerdict {
  /** False only when configured and the engine said no. */
  ok: boolean;
  /** True when no credentials are configured, so the caller keeps its old path. */
  skipped: boolean;
  check: OotoCheck;
  message: string;
  /** Machine readable reasons: no-face, multiple-faces, not-live, deepfake, wrong-document. */
  reasons: string[];
  score?: number;
  detail?: Record<string, unknown>;
}

function unavailable(check: OotoCheck, message = "Automated identity verification is unavailable. This application requires manual review."): OotoVerdict {
  return { ok: false, skipped: true, check, message, reasons: ["verification-unavailable"] };
}

export function ootoConfigured(): boolean {
  return Boolean(process.env.OOTO_APP_ID && process.env.OOTO_APP_KEY);
}

/** The app id doubles as the JWT's `appId` claim, so either form is accepted. */
function credentials(): { id: string; key: string } | null {
  const id = (process.env.OOTO_APP_ID || "").trim();
  const key = (process.env.OOTO_APP_KEY || "").trim();
  if (!id || !key) return null;
  return { id, key };
}

async function fetchBinary(url: string, limitBytes: number): Promise<{ blob: Blob; type: string }> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not read the uploaded file (${response.status}).`);

  const length = Number(response.headers.get("content-length") || 0);
  if (length > limitBytes) throw new Error("That file is too large to check. Take a smaller one.");

  const blob = await response.blob();
  if (blob.size === 0) throw new Error("That file was empty. Take it again.");
  if (blob.size > limitBytes) throw new Error("That file is too large to check. Take a smaller one.");

  return { blob, type: blob.type || "application/octet-stream" };
}

interface EngineError {
  code?: number;
  info?: string;
}

interface EngineResponse {
  transactionId?: string;
  result?: Record<string, unknown> & {
    status?: string;
    code?: number;
    info?: string;
    liveness?: { score?: number; fine?: boolean };
    deepfake?: { score?: number; fine?: boolean };
    comparison?: { similarity?: number; same?: boolean };
    ocr?: Record<string, string>;
    document?: { ocr?: Record<string, string> };
  };
}

async function callOoto(
  path: string,
  field: string,
  file: { blob: Blob; type: string },
  timeoutMs: number
): Promise<{ status: number; body: EngineResponse }> {
  const creds = credentials();
  if (!creds) throw new Error("OOTO is not configured.");

  const form = new FormData();
  form.append(field, file.blob, `${field}.${file.type.includes("video") ? "webm" : "jpg"}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "APP-ID": creds.id, "APP-KEY": creds.key },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    let body: EngineResponse = {};
    try {
      body = JSON.parse(text) as EngineResponse;
    } catch {
      body = { result: { status: "error", info: text.slice(0, 200) } };
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "The identity service rejected our credentials. Check OOTO_APP_ID and OOTO_APP_KEY in Vercel."
      );
    }

    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function engineError(body: EngineResponse): EngineError | null {
  const result = body.result;
  if (!result) return null;
  if (result.status === "error") {
    return { code: typeof result.code === "number" ? result.code : undefined, info: result.info };
  }
  if (typeof result.code === "number" && typeof result.liveness === "undefined") {
    return { code: result.code, info: result.info };
  }
  return null;
}

function messageFor(error: EngineError): { message: string; reasons: string[] } {
  const code = error.code;
  const reasons: string[] = [];

  if (code === 5) reasons.push("no-face");
  if (code === 6) reasons.push("multiple-faces");
  if (code === 8) reasons.push("face-mismatch");
  if (code === 201 || code === 202 || code === 208) reasons.push("not-a-document");
  if (code === 203) reasons.push("unreadable-document");
  if (code === 209 || code === 9) reasons.push("too-low-resolution");

  const message =
    (code !== undefined ? CODE_MESSAGES[code] : undefined) ||
    (error.info && error.info.length > 3
      ? `The identity service could not use that photo (${error.info}).`
      : "The identity service could not use that photo. Take it again.");

  return { message, reasons };
}

/* ------------------------------------------------------------------ */
/* Checks                                                             */
/* ------------------------------------------------------------------ */

/**
 * One photo, one face, alive, not synthetic. This is the check that decides
 * whether a selfie is a person at all.
 */
export async function checkSelfie(url: string): Promise<OotoVerdict> {
  if (!ootoConfigured()) {
    return unavailable("selfie");
  }

  try {
    const file = await fetchBinary(url, 8 * 1024 * 1024);
    const { status, body } = await callOoto("/liveness?check_deepfake=true", "photo", file, IMAGE_TIMEOUT_MS);
    const result = body.result ?? {};

    const error = engineError(body);
    if (error) {
      const { message, reasons } = messageFor(error);
      return { ok: false, skipped: false, check: "selfie", message, reasons, detail: { code: error.code } };
    }

    const liveness = result.liveness;
    const deepfake = result.deepfake;

    if (liveness && liveness.fine === false) {
      return {
        ok: false,
        skipped: false,
        check: "selfie",
        message:
          "That photo does not look like a live person. Hold the camera up and take a fresh selfie, do not photograph a screen or a printed picture.",
        reasons: ["not-live"],
        score: liveness.score,
      };
    }

    if (deepfake && deepfake.fine === false) {
      return {
        ok: false,
        skipped: false,
        check: "selfie",
        message:
          "That photo looks edited or generated. Take a new selfie with your own camera, with no filters.",
        reasons: ["deepfake"],
        score: deepfake.score,
      };
    }

    return {
      ok: status === 200,
      skipped: false,
      check: "selfie",
      message: "Live human face confirmed.",
      reasons: [],
      score: liveness?.score,
      detail: { liveness: liveness?.score, deepfake: deepfake?.score, quality: result.quality },
    };
  } catch (error) {
    // A network failure is not proof of a bad photo. Skip, and let the on-device
    // check stand, rather than punishing a member for our outage.
    console.warn("[ooto] selfie check unavailable:", (error as Error).message);
    return unavailable("selfie");
  }
}

/** The Ghana Card itself: is it a card, and what does it say. */
export async function checkCard(url: string): Promise<OotoVerdict> {
  if (!ootoConfigured()) {
    return unavailable("card");
  }

  try {
    const file = await fetchBinary(url, 8 * 1024 * 1024);
    const { status, body } = await callOoto("/recognize", "doc_image", file, IMAGE_TIMEOUT_MS);

    const error = engineError(body);
    if (error) {
      const { message, reasons } = messageFor(error);
      return { ok: false, skipped: false, check: "card", message, reasons, detail: { code: error.code } };
    }

    const result = body.result ?? {};
    const ocr = (result.ocr ?? result.document?.ocr ?? {}) as Record<string, string>;
    const number = ocr.identityCardNumber || "";

    return {
      ok: status === 200,
      skipped: false,
      check: "card",
      message: number
        ? `Card read: ${number}`
        : "Card accepted, but the number could not be read. Rabi will check it.",
      reasons: [],
      detail: {
        number,
        surname: ocr.surname ?? "",
        givenNames: ocr.givenNames ?? "",
        dateOfBirth: ocr.dateOfBirth ?? "",
        expiry: ocr.dateOfExpiration ?? "",
        documentType: typeof result.doc === "string" ? result.doc : "",
      },
    };
  } catch (error) {
    console.warn("[ooto] card check unavailable:", (error as Error).message);
    return unavailable("card");
  }
}

/** The liveness clip: is the face in it a live person. */
export async function checkVideo(url: string): Promise<OotoVerdict> {
  if (!ootoConfigured()) {
    return unavailable("video");
  }

  try {
    const file = await fetchBinary(url, 25 * 1024 * 1024);
    const { status, body } = await callOoto("/video/liveness", "video", file, VIDEO_TIMEOUT_MS);

    const error = engineError(body);
    if (error) {
      const { message, reasons } = messageFor(error);
      return { ok: false, skipped: false, check: "video", message, reasons, detail: { code: error.code } };
    }

    const liveness = body.result?.liveness;

    if (liveness && liveness.fine === false) {
      return {
        ok: false,
        skipped: false,
        check: "video",
        message:
          "The face scan did not look like a live person. Hold the phone at eye level, keep your whole face in the circle and do it again.",
        reasons: ["not-live"],
        score: liveness.score,
      };
    }

    return {
      ok: status === 200,
      skipped: false,
      check: "video",
      message: "Live face confirmed on video.",
      reasons: [],
      score: liveness?.score,
    };
  } catch (error) {
    console.warn("[ooto] video check unavailable:", (error as Error).message);
    return unavailable("video");
  }
}

/**
 * Card against selfie: the same person. Used when both documents exist, which
 * is the strongest signal the app can get about an application.
 */
export async function checkMatch(documentUrl: string, selfieUrl: string): Promise<OotoVerdict> {
  if (!ootoConfigured()) {
    return unavailable("match");
  }

  try {
    const [doc, selfie] = await Promise.all([
      fetchBinary(documentUrl, 8 * 1024 * 1024),
      fetchBinary(selfieUrl, 8 * 1024 * 1024),
    ]);

    const creds = credentials();
    if (!creds) throw new Error("OOTO is not configured.");

    const form = new FormData();
    form.append("doc", doc.blob, "card.jpg");
    form.append("selfie", selfie.blob, "selfie.jpg");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${BASE}/doc/compare`, {
        method: "POST",
        headers: { "APP-ID": creds.id, "APP-KEY": creds.key },
        body: form,
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }

    const body = (await response.json().catch(() => ({}))) as EngineResponse;
    const error = engineError(body);

    if (error) {
      const { message, reasons } = messageFor(error);
      return { ok: false, skipped: false, check: "match", message, reasons, detail: { code: error.code } };
    }

    const result = body.result ?? {};
    const same = result.comparison?.same === true;
    const similarity = result.comparison?.similarity;

    if (!same) {
      return {
        ok: false,
        skipped: false,
        check: "match",
        message:
          "The face on your selfie does not match the photo on your Ghana Card. Use a clear selfie of yourself, in good light, without a hat or sunglasses.",
        reasons: ["face-mismatch"],
        score: similarity,
      };
    }

    return {
      ok: true,
      skipped: false,
      check: "match",
      message: "The selfie matches the card portrait.",
      reasons: [],
      score: similarity,
      detail: { similarity, ocr: result.document?.ocr ?? result.ocr ?? {} },
    };
  } catch (error) {
    console.warn("[ooto] match check unavailable:", (error as Error).message);
    return unavailable("match");
  }
}
