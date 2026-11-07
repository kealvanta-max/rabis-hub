"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  Camera,
  CameraOff,
  Check,
  Info,
  Loader2,
  ShieldCheck,
  Smile,
  Upload,
} from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { serverKycCheck } from "@/lib/kyc-server-check";
import { createFaceLandmarker } from "@/lib/face-detection";
import FaceIdTile from "@/components/ui/face-id-tile";
import { cn } from "@/lib/utils";

interface FaceScanProps {
  onComplete: (videoUrl: string) => void;
  /** Called when the member cannot use a camera; an admin reviews manually. */
  onManualReview?: (reason: string) => void;
}

type Status =
  | "intro"
  | "starting"
  | "smile"
  | "blink"
  | "recording"
  | "uploading"
  | "done"
  | "fallback"
  | "error";

const CLIP_MS = 3000;
const CHALLENGE_MS = 22000;
const NO_FACE_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Liveness check.
 *
 * Design rules learned from the field:
 *  - the camera is only requested after an explicit tap (mobile browsers refuse
 *    a silent permission prompt);
 *  - every challenge has a deadline, so the scan can never loop forever;
 *  - there is always a way forward: record a short clip, or ask for manual
 *    review. A blocked camera must never trap someone in the signup flow.
 */
export default function FaceScan({ onComplete, onManualReview }: FaceScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const doneRef = useRef(false);

  const [status, setStatus] = useState<Status>("intro");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [recorderReady, setRecorderReady] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const teardown = useCallback(() => {
    clearTimers();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    const landmarker = landmarkerRef.current;
    landmarkerRef.current = null;
    if (landmarker) {
      try {
        landmarker.close();
      } catch {
        /* ignore */
      }
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;

    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }, [clearTimers]);

  useEffect(() => teardown, [teardown]);

  const uploadClip = useCallback(
    async (blob: Blob) => {
      if (doneRef.current) return;
      setStatus("uploading");
      try {
        const file = new File([blob], `liveness_${Date.now()}.webm`, {
          type: blob.type || "video/webm",
        });
        const url = await uploadToCloudinary(file);

        /*
         * The clip has to survive a server-side liveness check before it counts.
         * A printed photo, a phone screen or a mask can satisfy a camera, and the
         * browser cannot tell. The server can.
         */
        setStatus("uploading");
        setMessage("Checking that this is a real, live person…");
        const server = await serverKycCheck("video", url);

        if (!server.skipped && !server.ok) {
          setStatus("error");
          setMessage(
            server.message ||
              "That face scan did not look like a live person. Hold the phone at eye level and do it again."
          );
          return;
        }

        doneRef.current = true;
        setStatus("done");
        setProgress(100);
        teardown();
        onComplete(url);
      } catch (error) {
        console.error("Liveness upload failed:", error);
        setStatus("error");
        const reason = error instanceof Error && error.message ? error.message : "";
        setMessage(
          reason
            ? `Your clip was recorded but could not be uploaded. ${reason} You can still continue with manual review.`
            : "Your clip was recorded but could not be uploaded. Check your connection and try again, or continue with manual review."
        );
      }
    },
    [onComplete, teardown]
  );

  const startClipRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      setStatus("error");
      setMessage(
        "Your browser cannot record video, so the face check cannot finish. You can continue with manual review."
      );
      return;
    }
    if (recorder.state !== "inactive") return;
    chunksRef.current = [];
    setStatus("recording");
    setProgress(0);
    try {
      recorder.start();
    } catch {
      setStatus("error");
      setMessage("Your browser could not start the video recorder. You can continue with manual review.");
      return;
    }
    timersRef.current.push(
      window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, CLIP_MS)
    );
  }, []);

  const fail = useCallback(
    (copy: string, blocked = false) => {
      teardown();
      setCameraBlocked(blocked);
      setStatus("error");
      setMessage(copy);
    },
    [teardown]
  );

  const start = useCallback(async () => {
    setStatus("starting");
    setMessage("");
    setProgress(0);
    doneRef.current = false;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      fail(
        "This browser cannot open the camera. Use Chrome or Safari on a phone, or continue with manual review."
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (error) {
      const name = (error as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        fail(
          "Camera permission is blocked for this site. Tap the padlock in the address bar → Permissions → Camera → Allow, then press Try again.",
          true
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        fail("No camera was found on this device. You can continue with manual review.");
      } else if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
        fail(
          "Another app is using the camera right now. Close floating bubbles (WhatsApp chat heads, Instagram, TikTok, screen recorders) or any other app holding the camera, then press Try again.",
          true
        );
      } else {
        fail("We could not start the camera. Close other apps using it, then press Try again.");
      }
      return;
    }

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        /* muted autoplay — ignore */
      }
    }

    // Recorder -----------------------------------------------------------------
    try {
      const supportsWebm =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm");
      const recorder = new MediaRecorder(stream, supportsWebm ? { mimeType: "video/webm" } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (blob.size === 0) {
          setStatus("error");
          setMessage("The recording came out empty. Please try again.");
          return;
        }
        void uploadClip(blob);
      };
      recorderRef.current = recorder;
      setRecorderReady(true);
    } catch {
      setRecorderReady(false);
    }

    setStatus("smile");

    // Liveness model (optional) -------------------------------------------------
    try {
      /*
       * The runtime is served from our own domain (see scripts/vendor-kyc-assets.mjs)
       * with the CDN and CPU as fallbacks, so the same version and the same CSP
       * rules apply here as in the document checks.
       */
      const landmarker = await withTimeout(
        createFaceLandmarker({ runningMode: "VIDEO", numFaces: 1, blendshapes: true }),
        40000,
        "Face model"
      );

      landmarkerRef.current = landmarker;

      let lastVideoTime = -1;
      let smileDone = false;
      const startedAt = performance.now();
      let lastFaceAt = startedAt;
      let blinkedOnce = false;

      const loop = () => {
        const video = videoRef.current;
        const active = landmarkerRef.current;
        if (!active || !video || doneRef.current) return;

        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          let results;
          try {
            results = active.detectForVideo(video, performance.now());
          } catch {
            results = undefined;
          }

          const shapes = results?.faceBlendshapes?.[0]?.categories;

          if (shapes && shapes.length) {
            lastFaceAt = performance.now();
            const scoreOf = (name: string) =>
              shapes.find((shape) => shape.categoryName === name)?.score ?? 0;
            const smile = Math.max(scoreOf("mouthSmileLeft"), scoreOf("mouthSmileRight"));
            const blink = Math.min(scoreOf("eyeBlinkLeft"), scoreOf("eyeBlinkRight"));

            if (!smileDone) {
              setProgress(Math.min(Math.round(smile * 100), 100));
              if (smile > 0.5) {
                smileDone = true;
                setProgress(0);
                setStatus("blink");
                timersRef.current.push(
                  window.setTimeout(() => {
                    if (!blinkedOnce) {
                      setStatus("fallback");
                      setMessage("We could not detect a blink. Record a short clip instead, it takes 3 seconds.");
                    }
                  }, CHALLENGE_MS)
                );
              }
            } else if (blink > 0.35) {
              blinkedOnce = true;
              setProgress(0);
              startClipRecording();
              return;
            } else {
              setProgress(Math.min(Math.round(blink * 100), 100));
            }
          }

          const now = performance.now();
          if (!smileDone && now - startedAt > CHALLENGE_MS) {
            setStatus("fallback");
            setMessage(
              "We could not detect a smile. Record a short 3-second clip instead, an admin will review it."
            );
            return;
          }
          if (now-lastFaceAt > NO_FACE_MS && !smileDone) {
            setStatus("fallback");
            setMessage("We could not see your face clearly. Move into better light, then record a short clip.");
            return;
          }
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } catch (error) {
      console.warn("Liveness model unavailable, using clip fallback:", error);
      setStatus("fallback");
      setMessage(
        "The automatic face detector could not load on this connection. Record a 3-second clip instead, an admin reviews it."
      );
    }
  }, [fail, startClipRecording, uploadClip]);

  const retry = () => {
    teardown();
    setCameraBlocked(false);
    setMessage("");
    setProgress(0);
    setStatus("intro");
  };

  const manualReview = () => {
    teardown();
    onManualReview?.("manual_review");
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Camera viewport */}
      <div className="glass relative aspect-[4/5] overflow-hidden rounded-3xl sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "h-full w-full scale-x-[-1] object-cover",
            (status === "intro" || status === "starting" || status === "error") && "opacity-0"
          )}
        />

        {/* Idle / intro */}
        {/* Apple-style Face ID panel — tap the glass core to begin.
            The camera is only requested by that tap, which is what mobile
            browsers require and what keeps the permission prompt from
            appearing while the page is still loading. */}
        {status === "intro" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <FaceIdTile
              phase="idle"
              size={186}
              onActivate={start}
              label="Tap the glass to start your face check"
            />
            {/*
              The pretty panel is a lazy chunk. Until it arrives, or if it never
              does, this line is the way in: it starts the camera directly and
              does not depend on three.js at all.
            */}
            <button
              type="button"
              onClick={start}
              className="rounded-full px-3 py-1 text-[11px] font-semibold text-emerald-300 underline underline-offset-4 active:text-emerald-200"
            >
              Camera not opening? Tap here to start
            </button>
            <p className="max-w-[240px] text-[10px] leading-relaxed text-gray-500">
              Smile + blink · about 5 seconds · nothing is posted publicly
            </p>
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
            <p className="text-sm text-gray-300">Waiting for camera permission…</p>
            <p className="px-8 text-center text-[11px] text-gray-500">
              Tap <strong>Allow</strong> when your browser asks.
            </p>
          </div>
        )}

        {/* Live guidance */}
        {status === "smile" && (
          <div className="absolute inset-x-0 top-4 flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-bold text-[#02160C] shadow-lg">
              <Smile className="h-4 w-4" /> Smile at the camera
            </span>
            <div className="h-1.5 w-36 overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full bg-emerald-400 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === "blink" && (
          <div className="absolute inset-x-0 top-4 flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-4 py-2 text-sm font-bold text-[#02160C] shadow-lg">
              <ShieldCheck className="h-4 w-4" /> Now blink once
            </span>
            <div className="h-1.5 w-36 overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full bg-sky-400 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === "recording" && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white shadow-lg">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Recording 3 seconds…
            </span>
          </div>
        )}

        {status === "uploading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80">
            <Upload className="h-7 w-7 animate-pulse text-emerald-300" />
            <p className="text-sm font-semibold text-emerald-300">Securing your check…</p>
          </div>
        )}

        {status === "done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-emerald-950/60">
            <FaceIdTile phase="success" size={168} label="Liveness verified" />
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <CameraOff className="h-8 w-8 text-red-300" />
            <p className="text-xs leading-relaxed text-red-200">{message}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={retry}
                className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={manualReview}
                className="rounded-full bg-white/[0.06] px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white"
              >
                Continue with manual review
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Helper panel below the viewport */}
      {status === "intro" && (
        <div className="glass-soft flex items-start gap-2 rounded-2xl p-3 text-[11px] leading-relaxed text-gray-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <span>
            Close floating chat bubbles (WhatsApp, Instagram) and any app using the camera first, Android
            blocks the request while another app holds it.
          </span>
        </div>
      )}

      {(status === "fallback" || (status === "smile" && !recorderReady)) && (
        <div className="glass-soft space-y-2 rounded-2xl p-4 text-center">
          <p className="text-[11px] leading-relaxed text-amber-200">{message}</p>
          <button
            type="button"
            onClick={startClipRecording}
            disabled={!recorderReady}
            className="glass-emerald inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-emerald-50 disabled:opacity-40"
          >
            <Camera className="h-3.5 w-3.5" /> Record 3-second clip
          </button>
        </div>
      )}

      {status !== "done" && status !== "uploading" && (
        <button
          type="button"
          onClick={manualReview}
          className="w-full text-center text-[11px] text-gray-500 underline-offset-4 hover:text-gray-300 hover:underline"
        >
          Camera not working? Ask for manual review
        </button>
      )}
    </div>
  );
}
