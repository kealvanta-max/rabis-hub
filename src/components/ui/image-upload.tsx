"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2, ShieldAlert, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { captureException } from "@/lib/monitoring";
import { cn } from "@/lib/utils";
import type { DocVerdict } from "@/lib/kyc-verification";
import { sniffFileKind } from "@/lib/file-kind";
import ImageCropper from "@/components/ui/image-cropper";
import BlurUpImage from "@/components/ui/blur-up-image";

export type VerifyMode = "id-front" | "id-back" | "selfie";

interface ImageUploadProps {
  label: string;
  value: string;
  onUpload: (url: string) => void;
  /** Document checks to run before the file is uploaded. */
  verify?: VerifyMode;
  hint?: string;
  onVerdict?: (verdict: DocVerdict | null, fingerprint?: string | null) => void;
  /** Told why an upload failed, so the signup flow can offer a way forward. */
  onFailure?: (message: string) => void;
}

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
  hint,
  onVerdict,
  onFailure,
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

  /** Upload KYC evidence without treating browser heuristics as a verdict. */
  const processFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setVerdict(null);
    setStage("Uploading securely…");
    try {
      const url = await uploadToCloudinary(file);
      onUpload(url);
      if (verify) {
        const pending: DocVerdict = {
          status: "review",
          confidence: 0,
          message: "Uploaded. Automated screening is not identity verification; your application stays pending until Rabi reviews it.",
          reasons: ["awaiting-server-screening", "manual-review-required"],
        };
        setVerdict(pending);
        onVerdict?.(pending, null);
      }
    } catch (uploadError) {
      console.error("Upload failed:", uploadError);
      const name = uploadError instanceof Error && uploadError.name ? uploadError.name : typeof uploadError;
      captureException(uploadError, { scope: "kyc-upload", mode: verify, name });
      const reason = uploadError instanceof Error && uploadError.message
        ? uploadError.message
        : `Upload failed on this phone. Tell Rabi this code: ${name}.`;
      setError(reason);
      onFailure?.(reason);
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

      {hint && !value && <p className="mb-2 text-xs leading-relaxed text-gray-400">{hint}</p>}

      {value ? (
        <div>
          <div className="group relative overflow-hidden rounded-2xl border border-white/10">
            <BlurUpImage
              src={value}
              alt={label}
              eager
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
              <span className="relative flex h-10 w-10 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/15" aria-hidden="true" />
                <Loader2 className="relative h-6 w-6 animate-spin text-primary" />
              </span>
              <span className="px-4 text-center text-xs text-gray-300 transition-opacity" aria-live="polite">
                {stage || "Working…"}
              </span>
              <span className="text-[10px] text-gray-400">This takes a couple of seconds</span>
            </>
          ) : (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
                <Camera className="h-5 w-5 text-gray-300" />
              </span>
              <span className="text-xs font-semibold text-gray-300">Take a photo or choose a file</span>
              <span className="text-[10px] text-gray-400">JPG or PNG · good light · no glare</span>
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

      {error && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-xs leading-relaxed text-red-300"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

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
