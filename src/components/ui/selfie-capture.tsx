"use client";

/**
 * The Passport Photo / Selfie slot, captured live.
 *
 * Why this replaces a file input
 * -----------------------------
 * The report that started this work contained a Ghana Card front, a Ghana Card
 * back, and a photograph of a chihuahua as the "passport photo". All three
 * uploads succeeded. The dog was not a clever adversarial image: it was a
 * screenshot of a short video, chosen because the slot accepted any file from
 * the phone's gallery.
 *
 * No amount of screening fixes a picker. A file that came from storage can be
 * anything that has ever existed. A frame pulled out of a `getUserMedia` stream
 * could only have come from a camera this page was holding open at that moment.
 * That is not proof the person is real — a screen held in front of the lens
 * defeats it — but it removes the entire "reuse a saved image" class, which is
 * the class this app actually sees.
 *
 * What it deliberately keeps
 * -------------------------
 * A way forward for a member whose camera cannot open. Trap-the-user is the
 * failure mode that kills a signup flow, and Rabi would rather review a photo
 * than lose a saver. `captureMode` therefore records how the evidence was
 * obtained, and `"fallback-no-camera"` is a value the server can see, flag, and
 * route to her — never a silent pass.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, Loader2, RefreshCw, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { KycRejectionError, uploadToCloudinary, type UploadedEvidence } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import type { DocVerdict } from "@/lib/kyc-verification";

/**
 * How the selfie was obtained. Recorded with the submission.
 *
 * The server treats `"fallback-no-camera"` as a corroborating signal in
 * `assessCardRisk`: it is not a refusal, but it means no machine check can vouch
 * for how the image was made.
 */
export type CaptureMode = "live-camera" | "fallback-no-camera";

/**
 * Frames captured before choosing the sharpest one.
 *
 * Five frames over roughly half a second is enough to reject a frame caught
 * mid-blink without making the member hold still for a noticeable time.
 */
const BURST_FRAMES = 5;
const BURST_GAP_MS = 120;

interface SelfieCaptureProps {
  label: string;
  value: string;
  onUpload: (url: string, mode: CaptureMode) => void;
  onVerdict?: (verdict: DocVerdict | null) => void;
  onFailure?: (message: string) => void;
  /** The parent may force a fallback (for example after the camera is blocked). */
  allowFallback?: boolean;
}

type Phase = "idle" | "starting" | "live" | "uploading" | "done" | "blocked" | "fallback";

/** Sharpness proxy: mean absolute Laplacian. Higher is crisper. */
function sharpness(context: CanvasRenderingContext2D, width: number, height: number): number {
  const { data } = context.getImageData(0, 0, width, height);
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) {
    const p = i * 4;
    luma[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  let total = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const laplacian =
        4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - width] - luma[i + width];
      total += Math.abs(laplacian);
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

export default function SelfieCapture({
  label,
  value,
  onUpload,
  onVerdict,
  onFailure,
  allowFallback = true,
}: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<DocVerdict | null>(null);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const describeGetUserMediaFailure = (name: string): { copy: string; blocked: boolean } => {
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      return {
        copy: "Camera permission is blocked for this site. Tap the padlock in the address bar → Permissions → Camera → Allow, then try again.",
        blocked: true,
      };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return { copy: "This device did not offer a camera.", blocked: false };
    }
    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
      return {
        copy: "Another app is using the camera. Close WhatsApp chat bubbles, Instagram or any screen recorder, then try again.",
        blocked: false,
      };
    }
    return { copy: "We could not open the camera on this device.", blocked: false };
  };

  /**
   * Capture a short burst and keep the sharpest frame.
   *
   * A single grab at an arbitrary moment catches blinks and motion blur, and the
   * member then cannot tell why the next screen doubts their photo. Keeping the
   * best of five costs about half a second and nothing else.
   */
  const captureBurst = async (video: HTMLVideoElement): Promise<Blob | null> => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;

    let best: ImageData | null = null;
    let bestScore = -1;

    for (let frame = 0; frame < BURST_FRAMES; frame += 1) {
      context.drawImage(video, 0, 0, width, height);
      const score = sharpness(context, width, height);
      if (score > bestScore) {
        bestScore = score;
        best = context.getImageData(0, 0, width, height);
      }
      if (frame < BURST_FRAMES - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, BURST_GAP_MS));
      }
    }

    if (!best) return null;
    context.putImageData(best, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });
  };

  const upload = async (blob: Blob, mode: CaptureMode) => {
    setPhase("uploading");
    setError(null);
    setVerdict(null);
    setMessage("Captured. Checking this is a real photo of you…");
    try {
      const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" });
      const uploaded: UploadedEvidence = await uploadToCloudinary(file, "selfie");
      onUpload(uploaded.secure_url, mode);

      /*
       * Report the server's own conclusion. Nothing here upgrades the answer,
       * and a screening that could not confirm a face says so plainly instead of
       * being rounded up to a pass.
       */
      const reported: DocVerdict = {
        status: "review",
        confidence: 0,
        message: uploaded.screenPhoto
          ? "We noticed this looks like a photo of a screen. Rabi will verify it by hand before approving your account."
          : uploaded.screening === "screened_pass"
            ? "Uploaded. Nothing in this photo stood out, but a machine check cannot prove identity, so Rabi still reviews your application."
            : "Uploaded. We could not run every automatic check on this photo, so Rabi will look at it herself. This does not hold up your application.",
        reasons: uploaded.reasons.length ? uploaded.reasons : ["human-review-required"],
      };
      setVerdict(reported);
      onVerdict?.(reported);
      setPhase("done");
      setMessage("");
    } catch (uploadError) {
      setVerdict(null);
      if (uploadError instanceof KycRejectionError) {
        const refused: DocVerdict = {
          status: "rejected",
          confidence: 0,
          message: uploadError.message,
          reasons: uploadError.reasons.length ? uploadError.reasons : ["kyc-selfie-rejected"],
        };
        setVerdict(refused);
        setError(uploadError.message);
        onVerdict?.(refused);
        setPhase("live");
        return;
      }
      const reason =
        uploadError instanceof Error && uploadError.message
          ? uploadError.message
          : "The photo was taken but could not be uploaded.";
      setError(reason);
      onFailure?.(reason);
      setPhase("live");
    } finally {
      setMessage("");
    }
  };

  const startCamera = async () => {
    setPhase("starting");
    setError(null);
    setVerdict(null);
    setMessage("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("blocked");
      setError("This browser cannot open the camera. Use Chrome or Safari on a phone.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch (failure) {
      const { copy, blocked } = describeGetUserMediaFailure((failure as { name?: string })?.name ?? "");
      setPhase("blocked");
      setError(copy);
      setMessage(blocked ? "" : copy);
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        /* muted autoplay; ignore */
      }
    }
    setPhase("live");
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;
    const blob = await captureBurst(video);
    if (!blob) {
      setError("The camera did not produce a frame. Move into better light and try again.");
      return;
    }
    stopStream();
    await upload(blob, "live-camera");
  };

  const chooseFallback = () => {
    stopStream();
    setPhase("fallback");
    setError(null);
  };

  const reset = () => {
    stopStream();
    onUpload("", "live-camera");
    onVerdict?.(null);
    setVerdict(null);
    setError(null);
    setMessage("");
    setPhase("idle");
  };

  const tone =
    verdict?.status === "rejected" ? "red" : verdict ? "amber" : null;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {verdict && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              tone === "amber" && "bg-amber-500/15 text-amber-300",
              tone === "red" && "bg-red-500/15 text-red-300"
            )}
          >
            {tone === "amber" ? <ShieldAlert className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
            {verdict.status === "rejected" ? "Rejected" : "Review"}
          </span>
        )}
      </div>

      {value ? (
        <div>
          <div className="group relative overflow-hidden rounded-2xl border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={label} className="h-40 w-full object-cover" />
            <button
              type="button"
              onClick={reset}
              aria-label={`Retake ${label}`}
              className="absolute right-2 top-2 rounded-xl bg-black/60 p-2 text-white/90 backdrop-blur transition-colors hover:bg-red-600"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {verdict?.status !== "rejected" && (
              <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white/80 backdrop-blur">
                <Check className="h-3 w-3 text-emerald-400" /> Taken just now
              </div>
            )}
          </div>
          {verdict && verdict.status !== "rejected" && (
            <p
              className={cn(
                "mt-2 text-xs leading-relaxed",
                verdict.status === "verified" ? "text-emerald-300" : "text-amber-300"
              )}
            >
              {verdict.message}
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/[0.02]">
          <div className="relative aspect-[4/5] w-full bg-black/40 sm:aspect-[4/3]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "h-full w-full scale-x-[-1] object-cover",
                (phase === "idle" || phase === "starting" || phase === "blocked") && "opacity-0"
              )}
            />

            {(phase === "idle" || phase === "blocked") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
                {phase === "blocked" ? (
                  <CameraOff className="h-8 w-8 text-red-300" />
                ) : (
                  <Camera className="h-8 w-8 text-gray-300" />
                )}
                <p className="text-xs leading-relaxed text-gray-300">
                  {error || "This photo has to be taken live, with the camera, right now. A saved picture cannot be used."}
                </p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-bold text-[#02160C]"
                >
                  <Camera className="h-4 w-4" />
                  {phase === "blocked" ? "Try the camera again" : "Open the camera"}
                </button>
              </div>
            )}

            {phase === "starting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
                <p className="text-sm text-gray-300">Waiting for camera permission…</p>
                <p className="px-8 text-center text-[11px] text-gray-400">
                  Tap <strong>Allow</strong> when your browser asks.
                </p>
              </div>
            )}

            {phase === "live" && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={takePhoto}
                  className="h-16 w-16 rounded-full border-4 border-white/80 bg-white/20 backdrop-blur transition active:scale-95"
                  aria-label="Take the photo now"
                />
                <p className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
                  Head and shoulders · good light · look at the camera
                </p>
              </div>
            )}

            {phase === "uploading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-300" />
                <p className="text-sm font-semibold text-emerald-300">{message || "Checking…"}</p>
              </div>
            )}
          </div>

          {/* The honest escape hatch, kept visible rather than hidden in a menu. */}
          {phase !== "uploading" && allowFallback && (
            <button
              type="button"
              onClick={chooseFallback}
              className="w-full border-t border-white/10 px-3 py-2.5 text-[11px] text-gray-400 underline-offset-4 hover:text-gray-200 hover:underline"
            >
              {phase === "fallback"
                ? "Camera still not working? Ask Rabi to verify you by hand"
                : "My camera will not open"}
            </button>
          )}
        </div>
      )}

      {phase === "fallback" && (
        <div className="mt-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.08] p-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No problem. Your application will be sent to Rabi without a live selfie and she will verify you
              herself. Nothing is rejected. A human check simply replaces the automatic one.
            </span>
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-amber-100/70">
            Because no camera check ran, your application is marked for closer review. That is the honest
            trade: we would rather look at you twice than let a saved photo pretend to be you.
          </p>
        </div>
      )}

      {error && phase !== "blocked" && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-xs leading-relaxed text-red-300"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{error}</span>
        </div>
      )}
    </div>
  );
}
