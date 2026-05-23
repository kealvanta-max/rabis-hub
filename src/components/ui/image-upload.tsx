"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { verifyGhanaCardWithOCR, type OcrResult } from "@/lib/ghana-card-ocr";
import { detectHumanFace, type FaceDetectionResult } from "@/lib/face-detection";

interface ImageUploadProps {
  label: string;
  value: string;
  onUpload: (url: string) => void;
  accept?: string;
  enableOcr?: boolean;
  declaredCardNumber?: string;
  onOcrResult?: (result: OcrResult) => void;
  enableFaceDetection?: boolean;
  onFaceDetectionResult?: (result: FaceDetectionResult) => void;
}

export default function ImageUpload({
  label,
  value,
  onUpload,
  accept = "image/*",
  enableOcr = false,
  declaredCardNumber = "",
  onOcrResult,
  enableFaceDetection = false,
  onFaceDetectionResult,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [faceDetectionResult, setFaceDetectionResult] = useState<FaceDetectionResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Max 10MB.");
      return;
    }

    setUploading(true);
    setError(null);
    setOcrResult(null);
    setFaceDetectionResult(null);

    try {
      const url = await uploadToCloudinary(file);
      onUpload(url);

      // Run OCR if enabled
      if (enableOcr && declaredCardNumber) {
        setVerifying(true);
        try {
          const result = await verifyGhanaCardWithOCR(url, declaredCardNumber);
          setOcrResult(result);
          if (onOcrResult) onOcrResult(result);
        } catch (err) {
          console.error("OCR failed:", err);
          setOcrResult({
            valid: false,
            confidence: 0,
            message: "OCR verification unavailable.",
          });
        } finally {
          setVerifying(false);
        }
      }

      // Run face detection if enabled
      if (enableFaceDetection) {
        setVerifying(true);
        try {
          const result = await detectHumanFace(url);
          setFaceDetectionResult(result);
          if (onFaceDetectionResult) onFaceDetectionResult(result);

          // Clear the image if no face detected
          if (!result.isHuman) {
            onUpload("");
            if (inputRef.current) inputRef.current.value = "";
          }
        } catch (err) {
          console.error("Face detection failed:", err);
          setFaceDetectionResult({
            isHuman: true,
            confidence: 0,
            message: "Face detection unavailable — admin will verify manually.",
          });
        } finally {
          setVerifying(false);
        }
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full">
      <p className="text-sm font-medium text-gray-300 mb-2">{label}</p>

      {value ? (
        <div className="w-full">
          <div className="relative group">
            <Image
              src={value}
              alt={label}
              width={400}
              height={160}
              className="w-full h-40 object-cover rounded-xl border border-gray-700"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  onUpload("");
                  if (inputRef.current) inputRef.current.value = "";
                  setOcrResult(null);
                  setFaceDetectionResult(null);
                }}
                className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
            <div className="absolute top-2 right-2 bg-emerald-600 rounded-full p-1">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          {/* OCR Result Badge */}
          {ocrResult && (
            <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
              ocrResult.valid
                ? "bg-green-900/30 border border-green-700/50"
                : "bg-amber-900/30 border border-amber-700/50"
            }`}>
              {ocrResult.valid ? (
                <>
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs text-green-300">OCR: Card pattern detected</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs text-amber-300">OCR: Could not verify card pattern — admin will review</span>
                </>
              )}
            </div>
          )}

          {/* Face Detection Result Badge */}
          {faceDetectionResult && (
            <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
              faceDetectionResult.isHuman
                ? "bg-green-900/30 border border-green-700/50"
                : "bg-red-900/30 border border-red-700/50"
            }`}>
              {faceDetectionResult.isHuman ? (
                <>
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs text-green-300">Face detected ✓</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs text-red-300">No face detected — please upload a clear photo of your face</span>
                </>
              )}
            </div>
          )}

          {verifying && (
            <div className="mt-3 p-3 rounded-lg bg-blue-900/30 border border-blue-700/50 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-blue-300">Verifying...</span>
            </div>
          )}
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
            uploading
              ? "border-primary/50 bg-primary/5"
              : "border-gray-600 hover:border-primary/40 hover:bg-white/[0.02]"
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-gray-400">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs text-gray-400">Click to upload</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      )}

      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}
