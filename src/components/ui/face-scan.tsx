"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { uploadToCloudinary } from "@/lib/cloudinary";

interface FaceScanProps {
  onComplete: (videoUrl: string) => void;
}

type Challenge = "idle" | "smile" | "blink" | "recording" | "uploading" | "done" | "error";

const CLIP_MS = 3000;

/** Rejects after `ms` so a slow/blocked CDN can never freeze the signup flow. */
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

export default function FaceScan({ onComplete }: FaceScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onCompleteRef = useRef(onComplete);

  const [hasCamera, setHasCamera] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [challenge, setChallenge] = useState<Challenge>("idle");
  const [progress, setProgress] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  // Keep the parent callback in a ref: an inline arrow prop used to re-run the
  // whole camera effect on every render, which restarted the scan forever.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let active = true;
    let landmarker: FaceLandmarker | null = null;
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;
    let uploaded = false;

    const upload = async (blob: Blob) => {
      if (uploaded) return;
      uploaded = true;
      setChallenge("uploading");
      try {
        const file = new File([blob], `face_scan_${Date.now()}.webm`, { type: blob.type || "video/webm" });
        const url = await uploadToCloudinary(file);
        if (!active) return;
        setChallenge("done");
        setProgress(100);
        onCompleteRef.current(url);
      } catch (uploadError) {
        console.error("Liveness upload failed:", uploadError);
        if (!active) return;
        uploaded = false;
        setError("Could not upload your verification clip. Check your connection and try again.");
        setChallenge("error");
      }
    };

    const stopRecording = () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") recorder.stop();
    };

    const startRecording = () => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "inactive") return;
      chunksRef.current = [];
      setChallenge("recording");
      try {
        recorder.start();
      } catch (recordingError) {
        console.error("Unable to start recording:", recordingError);
        setError("Your browser could not start the video recorder.");
        setChallenge("error");
        return;
      }
      window.setTimeout(stopRecording, CLIP_MS);
    };

    const setup = async () => {
      // 1. Camera first – if this fails nothing else matters.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (cameraError) {
        console.error("Camera error:", cameraError);
        if (!active) return;
        setLoading(false);
        setError(
          "Camera access is required for the liveness check. Allow camera access in your browser settings and try again."
        );
        setChallenge("error");
        return;
      }

      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          /* autoplay with muted should work; ignore */
        }
      }
      setHasCamera(true);
      setLoading(false);
      setChallenge("smile");

      // 2. Recorder
      try {
        const supportsWebm = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm");
        mediaRecorderRef.current = new MediaRecorder(stream, supportsWebm ? { mimeType: "video/webm" } : undefined);
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = () => {
          if (!active) return;
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          if (blob.size === 0) {
            setError("The recording was empty. Please try again.");
            setChallenge("error");
            return;
          }
          void upload(blob);
        };
      } catch (recorderError) {
        console.error("MediaRecorder unavailable:", recorderError);
        setAiUnavailable(true);
        setError("Your browser does not support video recording, so the liveness check cannot complete.");
        setChallenge("error");
        return;
      }

      // 3. MediaPipe liveness model (optional). If it fails we degrade to a
      //    timed recording so registration is never blocked by the CDN.
      try {
        const { FaceLandmarker: Landmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const filesetResolver = await withTimeout(
          FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"),
          20000,
          "Face model download"
        );

        const create = (delegate: "GPU" | "CPU") =>
          Landmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate,
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1,
          });

        landmarker = await withTimeout(create("GPU"), 25000, "Face model").catch(() =>
          withTimeout(create("CPU"), 25000, "Face model")
        );

        if (!active || !landmarker) return;

        let lastVideoTime = -1;
        let smileDetected = false;
        let challengeStarted = false;

        const predictWebcam = () => {
          const video = videoRef.current;
          if (!active || !video || !landmarker) return;

          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;

            let results;
            try {
              results = landmarker.detectForVideo(video, performance.now());
            } catch {
              results = undefined;
            }

            const shapes = results?.faceBlendshapes?.[0]?.categories;
            if (shapes && shapes.length) {
              const scoreOf = (name: string) => shapes.find((s) => s.categoryName === name)?.score || 0;
              const smileScore = Math.max(scoreOf("mouthSmileLeft"), scoreOf("mouthSmileRight"));
              const blinkScore = Math.max(scoreOf("eyeBlinkLeft"), scoreOf("eyeBlinkRight"));

              if (!challengeStarted) {
                challengeStarted = true;
                setChallenge("smile");
              }

              setChallenge((current) => {
                if (current === "smile") {
                  setProgress(Math.min(Math.round(smileScore * 100), 100));
                  if (smileScore > 0.55) {
                    smileDetected = true;
                    setProgress(0);
                    return "blink";
                  }
                } else if (current === "blink") {
                  setProgress(Math.min(Math.round(blinkScore * 100), 100));
                  if (blinkScore > 0.35 && smileDetected) {
                    // Defer so the state updater stays pure.
                    window.setTimeout(startRecording, 0);
                    return "recording";
                  }
                }
                return current;
              });
            }
          }

          if (active) animationFrameId = requestAnimationFrame(predictWebcam);
        };

        animationFrameId = requestAnimationFrame(predictWebcam);
      } catch (modelError) {
        console.warn("Liveness model unavailable, using manual recording fallback:", modelError);
        if (!active) return;
        setAiUnavailable(true);
      }
    };

    setup();

    return () => {
      active = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [retryKey]);

  const restart = () => {
    setError("");
    setAiUnavailable(false);
    setProgress(0);
    setChallenge("idle");
    setLoading(true);
    setHasCamera(false);
    setRetryKey((key) => key + 1);
  };

  const startFallbackRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "inactive") return;
    chunksRef.current = [];
    setChallenge("recording");
    recorder.start();
    window.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, CLIP_MS);
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/50 border border-white/10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${hasCamera && challenge !== "done" ? "scale-x-[-1]" : "hidden"}`}
        />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-primary">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3"></div>
            <p className="text-sm font-medium">Initializing AI Camera...</p>
            <p className="text-xs text-gray-500 mt-1 px-6 text-center">Allow camera access when your browser asks.</p>
          </div>
        )}

        {(error || challenge === "error") && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-red-900/30 p-6 text-center">
            <p className="text-red-300 text-sm font-semibold">{error || "Liveness check failed."}</p>
            <button
              type="button"
              onClick={restart}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}

        {challenge === "smile" && (
          <div className="absolute top-4 left-0 right-0 text-center">
            <div className="inline-block bg-primary text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-pulse">
              Please Smile 😊
            </div>
            <div className="mt-2 w-32 h-1.5 bg-black/50 rounded-full mx-auto overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {challenge === "blink" && (
          <div className="absolute top-4 left-0 right-0 text-center">
            <div className="inline-block bg-blue-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-pulse">
              Now Blink Your Eyes 👀
            </div>
            <div className="mt-2 w-32 h-1.5 bg-black/50 rounded-full mx-auto overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {challenge === "recording" && (
          <div className="absolute top-4 left-0 right-0 text-center">
            <div className="inline-flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white" />
              Recording Verification
            </div>
          </div>
        )}

        {challenge === "uploading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-3"></div>
            <p className="text-emerald-400 text-sm font-bold">Securely uploading...</p>
          </div>
        )}

        {challenge === "done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-900/40">
            <svg className="w-12 h-12 text-emerald-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-emerald-400 font-bold">Liveness Verified</p>
          </div>
        )}
      </div>

      {aiUnavailable && hasCamera && !error && challenge !== "done" && challenge !== "recording" && challenge !== "uploading" && (
        <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl p-4 text-center space-y-3">
          <p className="text-xs text-amber-200">
            The automatic smile/blink detector is unavailable right now. You can still record a short 3-second
            verification clip — an admin will review it manually.
          </p>
          <button
            type="button"
            onClick={startFallbackRecording}
            className="px-4 py-2 rounded-lg bg-primary text-black text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
          >
            Record verification clip
          </button>
        </div>
      )}

      <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-sm text-gray-400 text-center">
        {challenge === "idle" || loading
          ? "Please allow camera access to continue."
          : challenge === "done"
          ? "Verification complete. You can proceed to the next step."
          : challenge === "error"
          ? "Camera unavailable. Fix the issue above and retry."
          : "Follow the on-screen instructions. This confirms you are a real person."}
      </div>
    </div>
  );
}
