import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server-auth";
import { kycVisionConfigured, screenSelfie, visionProviderNames } from "@/lib/kyc-vision";
import { deterministicEngineStatus, judgeSelfiePhoto, centralFaceBox } from "@/lib/kyc-deterministic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Will the AI actually look at a photo right now?"
 *
 * Every past KYC outage read the same from the outside: the admin panel said
 * "manual review", and the real reason lived in a Vercel log nobody had access
 * to at that moment. This route answers the question directly, from production,
 * without touching a member's documents.
 *
 * It sends a synthetic image through the real screening path (tiny PNG, no
 * personal data), and reports:
 *
 *   - which providers are configured (names only, never a key);
 *   - whether the model responded at all;
 *   - whether the answer was parseable;
 *   - the exact refusal class when it was not (bad key, quota, retired model).
 *
 * Admin only. It never echoes a secret and never stores an image.
 */
const PROBE_PNG = Buffer.from(
  // 8x8 solid grey PNG: a valid image with no face and no card in it.
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC",
  "base64"
);

export async function GET(request: Request) {
  const actor = await authenticateRequest(request);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!actor.admin) return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });

  const configured = kycVisionConfigured();
  const providers = visionProviderNames();

  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        providers,
        summary:
          "No vision AI key is set. Every application will be saved for manual review, and photos of animals or fake cards will only be caught by you.",
        howToFix: [
          "Get a free key from https://aistudio.google.com/apikey (Gemini) or https://console.groq.com/keys (Groq).",
          "Add it in Vercel as GEMINI_API_KEY or GROQ_API_KEY, server side only, never with a NEXT_PUBLIC_ prefix.",
          "Redeploy, then open this page again.",
        ],
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  /*
   * Prove the deterministic layer too, not just the AI one.
   *
   * A grey square must be refused for having no skin in it. If that check does
   * not fire, the "AI keys are set but a dog photo still passes" situation is
   * back, and the operator needs to see it here rather than in Rabi's queue.
   */
  const engine = await deterministicEngineStatus();
  const greyGrid = {
    width: 32,
    height: 32,
    values: Array.from({ length: 32 * 32 }, () => [128, 128, 128] as [number, number, number]),
  };
  const greySelfie = judgeSelfiePhoto(greyGrid, centralFaceBox());

  const result = await screenSelfie({ mime: "image/png", base64: PROBE_PNG.toString("base64") });

  /*
   * A grey square must not come back as "human face". If it does, the provider
   * is answering without looking, and its verdicts must not be trusted: that is
   * reported as a failure even though the HTTP call succeeded.
   */
  const answered = Boolean(result.provider);
  const sawHuman = result.signals?.subject === "human_face";

  const summary = !answered
    ? `The AI provider was configured but did not answer. Reason: ${result.reasons.join(", ")}.`
    : sawHuman
      ? "The provider answered, but claimed a plain grey square contains a human face. Do not trust its verdicts until this is resolved."
      : `Working. ${result.provider} answered and correctly found no human face in a test image.`;

  return NextResponse.json(
    {
      ok: answered && !sawHuman,
      configured: true,
      providers,
      deterministic: {
        ocrEngine: engine.ocr ? "ready" : "unavailable",
        rejectedBlankSquare: greySelfie.status === "fail",
        reasons: greySelfie.reasons,
      },
      provider: result.provider ?? null,
      model: result.model ?? null,
      state: result.state,
      reasons: result.reasons,
      signals: result.signals ?? null,
      attempts: result.attempts ?? [],
      durationMs: result.durationMs ?? null,
      summary,
      checkedAt: new Date().toISOString(),
    },
    { status: answered && !sawHuman ? 200 : 502, headers: { "Cache-Control": "no-store" } }
  );
}
