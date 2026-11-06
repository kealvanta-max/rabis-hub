"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, Loader2, ShieldAlert, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { recognizeDocument } from "@/lib/ghana-card-ocr";
import { detectHumanFace, fingerprintImage } from "@/lib/face-detection";
import {
  checkCardAspectRatio,
  evaluateIdBack,
  evaluateIdFront,
  evaluateSelfie,
  checkImageQuality,
  type DocVerdict,
} from "@/lib/kyc-verification";
import { cn } from "@/lib/utils";
import { sniffFileKind } from "@/lib/file-kind";
import ImageCropper from "@/components/ui/image-cropper";

export type VerifyMode = "id-front" | "id-back" | "selfie";

interface ImageUploadProps {
  label: string;
  value: string;
  onUpload: (url: string) => void;
  /** Document checks to run before the file is uploaded. */
  verify?: VerifyMode;
  declaredCardNumber?: string;
  hint?: string;
  onVerdict?: (verdict: DocVerdict | null, fingerprint?: string | null) => void;
}

const modeCopy: Record<VerifyMode, string> = {
  "id-front": "Reading your card…",
  "id-back": "Checking the back of your card…",
  selfie: "Looking for your face…",
};

/** Frame shape the member crops into — ID-1 for the card, portrait for a face. */
const cropAspect: Record<VerifyMode, number> = {
  "id-front": 1.586,
  "id-back": 1.586,
  selfie: 0.8,
};

const cropTitle: Record<VerifyMode, string> = {
  "id-front": "Fit your card in the frame",
  "id-back": "Fit the back of your card",
  selfie: "Fit your face in the frame",
};

const cropHint: Record<VerifyMode, string> = {
  "id-front": "All four corners inside the brackets, number readable, no glare.",
  "id-back": "The whole back of the card, barcode visible if it has one.",
  selfie: "Head and shoulders, eyes open, plain background, good light.",
};

export default function ImageUpload({
  label,
  value,
  onUpload,
  verify,
  declaredCardNumber = "",
  hint,
  onVerdict,
}: ImageUploadProps) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<DocVerdict | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    onUpload("");
    setVerdict(null);
    setError(null);
    onVerdict?.(null, null);
    if (inputRef.current) inputRef.current.value = "";
  };

  /**
   * Validates the pick, then hands it to the cropper.
   *
   * The check reads the first bytes instead of trusting `file.type`: Android
   * hands back an empty type for some gallery picks and labels HEIC files as
   * JPEG, so the old string test refused real photos of real Ghana Cards.
   */
  const handleFile = async (file: File) => {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const looksLikeImage = sniffFileKind(head) === "image" || file.type.startsWith("image/");

    if (!looksLikeImage) {
      setError("Please choose a photo (JPG, PNG or HEIC).");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError("That photo is unusually large. Take a new one and try again.");
      return;
    }
    setError(null);
    setPendingFile(file);
  };

  /** Runs the document checks on the cropped result. */
  const processFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setVerdict(null);
    setStage("Preparing…");

    try {
      const fingerprint = await fingerprintImage(file).catch(() => ({
        hash: "",
        width: 0,
        height: 0,
        brightness: 128,
        contrast: 52,
      }));

      let nextVerdict: DocVerdict | null = null;

      const quality = checkImageQuality({
        brightness: fingerprint.brightness,
        contrast: fingerprint.contrast,
      });

      if (!quality.ok) {
        setVerdict({ status: "rejected", confidence: 0, message: quality.reason ?? "Photo rejected.", reasons: ["quality"] });
        onVerdict?.(
          { status: "rejected", confidence: 0, message: quality.reason ?? "Photo rejected.", reasons: ["quality"] },
          fingerprint.hash
        );
        setError(quality.reason ?? "Photo rejected.");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      if (verify === "id-front" || verify === "id-back") {
        setStage("Checking the photo…");
        const aspect = checkCardAspectRatio(fingerprint.width, fingerprint.height);

        if (!aspect.ok) {
          nextVerdict = {
            status: "rejected",
            confidence: 0,
            message: aspect.reason ?? "That does not look like a card.",
            reasons: ["aspect-ratio"],
          };
        } else {
          setStage(modeCopy[verify]);
          try {
            const ocr = await recognizeDocument(file);
            nextVerdict =
              verify === "id-front"
                ? evaluateIdFront(ocr.text, declaredCardNumber, aspect)
                : evaluateIdBack(ocr.text, declaredCardNumber, aspect);
          } catch {
            // The reader itself failed (slow network, CDN blocked, exotic format).
            // Never trap the member: accept the photo for manual admin review.
            nextVerdict = {
              status: "review",
              confidence: 0,
              message:
                "We could not read the card automatically on this connection. Rabi will check this photo manually.",
              reasons: ["ocr-unavailable"],
            };
          }
        }
      }

      if (verify === "selfie") {
        setStage(modeCopy.selfie);
        const face = await detectHumanFace(file);
        nextVerdict = evaluateSelfie(
          { faceCount: face.faceCount, areaRatio: face.areaRatio, confidence: face.confidence },
          face.skipped
        );
      }

      if (nextVerdict) {
        setVerdict(nextVerdict);
        onVerdict?.(nextVerdict, fingerprint.hash);

        if (nextVerdict.status === "rejected") {
          setError(nextVerdict.message);
          if (inputRef.current) inputRef.current.value = "";
          return;
        }
      }

      setStage("Uploading…");
      const url = await uploadToCloudinary(file);
      onUpload(url);
      onVerdict?.(nextVerdict, fingerprint.hash);
    } catch (uploadError) {
      console.error("Upload failed:", uploadError);
      // Show what actually went wrong. A generic "check your connection" hides
      // key mismatches, size limits and rate limits, which are the real causes.
      setError(
        uploadError instanceof Error && uploadError.message
          ? uploadError.message
          : "Upload failed. Check your connection and try again."
      );
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const tone =
    verdict?.status === "verified"
      ? "emerald"
      : verdict?.status === "review"
      ? "amber"
      : verdict?.status === "rejected"
      ? "red"
      : null;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {verdict && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              tone === "emerald" && "bg-emerald-500/15 text-emerald-300",
              tone === "amber" && "bg-amber-500/15 text-amber-300",
              tone === "red" && "bg-red-500/15 text-red-300"
            )}
          >
            {tone === "emerald" ? (
              <ShieldCheck className="h-3 w-3" />
            ) : tone === "amber" ? (
              <ShieldAlert className="h-3 w-3" />
            ) : (
              <TriangleAlert className="h-3 w-3" />
            )}
            {verdict.status === "verified" ? "Verified" : verdict.status === "review" ? "Review" : "Rejected"}
          </span>
        )}
      </div>

      {hint && !value && <p className="mb-2 text-xs leading-relaxed text-gray-500">{hint}</p>}

      {value ? (
        <div>
          <div className="group relative overflow-hidden rounded-2xl border border-white/10">
            <Image
              src={value}
              alt={label}
              width={720}
              height={440}
              className="h-40 w-full object-cover"
            />
            <button
              type="button"
              onClick={reset}
              aria-label={`Remove ${label}`}
              className="absolute right-2 top-2 rounded-xl bg-black/60 p-2 text-white/90 backdrop-blur transition-colors hover:bg-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {verdict?.status !== "rejected" && (
              <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white/80 backdrop-blur">
                <Check className="h-3 w-3 text-emerald-400" /> Uploaded
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
        <label
          className={cn(
            "flex h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-all",
            busy
              ? "border-primary/50 bg-primary/5"
              : error
              ? "border-red-500/40 bg-red-500/5 hover:border-red-400/60"
              : "border-white/15 bg-white/[0.02] hover:border-emerald-400/40 hover:bg-white/[0.04]"
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="px-4 text-center text-xs text-gray-400">{stage || "Working…"}</span>
            </>
          ) : (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
                <Camera className="h-5 w-5 text-gray-300" />
              </span>
              <span className="text-xs font-semibold text-gray-300">Take a photo or choose a file</span>
              <span className="text-[10px] text-gray-500">JPG or PNG · good light · no glare</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}

      {error && <p className="mt-2 text-xs leading-relaxed text-red-400">{error}</p>}

      {pendingFile && (
        <ImageCropper
          file={pendingFile}
          aspect={verify ? cropAspect[verify] : 4 / 3}
          title={verify ? cropTitle[verify] : "Crop your photo"}
          subtitle={verify ? cropHint[verify] : undefined}
          onCancel={() => setPendingFile(null)}
          onConfirm={(blob) => {
            const cropped = new File([blob], `crop-${Date.now()}.jpg`, { type: "image/jpeg" });
            setPendingFile(null);
            void processFile(cropped);
          }}
        />
      )}
    </div>
  );
}
