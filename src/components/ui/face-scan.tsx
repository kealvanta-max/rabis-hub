"use client";

import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { uploadToCloudinary } from "@/lib/cloudinary";
import Button from "./button";

interface FaceScanProps {
  onComplete: (videoUrl: string) => void;
}

export default function FaceScan({ onComplete }: FaceScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const [hasCamera, setHasCamera] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState<"idle" | "smile" | "blink" | "recording" | "uploading" | "done">("idle");
  const [progress, setProgress] = useState(0);

  // Initialize camera and MediaPipe
  useEffect(() => {
    let active = true;
    let landmarker: FaceLandmarker | null = null;
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    const setup = async () => {
      try {
        // Load MediaPipe
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
        );
        landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });

        if (!active) return;

        // Start Camera
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          setHasCamera(true);
          setLoading(false);
          setChallenge("smile");
        }

        // Setup recording
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        mediaRecorderRef.current.onstop = async () => {
          if (!active) return;
          setChallenge("uploading");
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          try {
            // Convert Blob to File
            const file = new File([blob], "face_scan.webm", { type: "video/webm" });
            const url = await uploadToCloudinary(file);
            if (active) {
              setChallenge("done");
              onComplete(url);
            }
          } catch (err) {
            if (active) setError("Failed to process or upload recording.");
          }
        };

        // Processing loop
        let lastVideoTime = -1;
        let smileDetected = false;
        let blinkDetected = false;
        
        const predictWebcam = async () => {
          if (!videoRef.current || !landmarker || !active) return;
          
          let startTimeMs = performance.now();
          if (lastVideoTime !== videoRef.current.currentTime) {
            lastVideoTime = videoRef.current.currentTime;
            
            const results = landmarker.detectForVideo(videoRef.current, startTimeMs);
            
            if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
              const shapes = results.faceBlendshapes[0].categories;
              
              // Find smile and blink scores
              const smileScore = Math.max(
                shapes.find(s => s.categoryName === "mouthSmileLeft")?.score || 0,
                shapes.find(s => s.categoryName === "mouthSmileRight")?.score || 0
              );
              
              const blinkScore = Math.max(
                shapes.find(s => s.categoryName === "eyeBlinkLeft")?.score || 0,
                shapes.find(s => s.categoryName === "eyeBlinkRight")?.score || 0
              );

              // Challenge logic
              setChallenge(current => {
                if (current === "smile") {
                  setProgress(Math.min(smileScore * 100, 100));
                  if (smileScore > 0.6) {
                    smileDetected = true;
                    return "blink";
                  }
                } else if (current === "blink") {
                  setProgress(Math.min(blinkScore * 100, 100));
                  if (blinkScore > 0.4 && smileDetected) {
                    blinkDetected = true;
                    // Start recording when challenges pass
                    if (mediaRecorderRef.current?.state === "inactive") {
                      mediaRecorderRef.current.start();
                      setTimeout(() => {
                        if (mediaRecorderRef.current?.state === "recording") {
                          mediaRecorderRef.current.stop();
                        }
                      }, 3000); // 3 second clip
                    }
                    return "recording";
                  }
                }
                return current;
              });
            }
          }
          
          if (active) {
            animationFrameId = requestAnimationFrame(predictWebcam);
          }
        };

        if (videoRef.current) {
          videoRef.current.addEventListener('loadeddata', predictWebcam);
        }

      } catch (err) {
        if (active) {
          setError("Failed to initialize camera or AI model.");
          setLoading(false);
        }
      }
    };

    setup();

    return () => {
      active = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (landmarker) landmarker.close();
    };
  }, [onComplete]);

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/50 border border-white/10">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full object-cover ${hasCamera && challenge !== 'done' ? 'scale-x-[-1]' : 'hidden'}`}
        />
        
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-primary">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3"></div>
            <p className="text-sm font-medium">Initializing AI Camera...</p>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/20">
            <p className="text-red-400 text-sm font-bold">{error}</p>
          </div>
        )}

        {/* Overlays */}
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

      <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-sm text-gray-400 text-center">
        {challenge === "idle" || loading ? "Please allow camera access to continue." : 
         challenge === "done" ? "Verification complete. You can proceed to the next step." :
         "Follow the on-screen instructions. This confirms you are a real person."}
      </div>
    </div>
  );
}
