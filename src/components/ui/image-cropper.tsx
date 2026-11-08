"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import { useCspNonce } from "@/context/csp-nonce-context";
import { Check, Loader2, RotateCw, X, ZoomIn } from "lucide-react";
import { clamp, clampCropOffset, cropGeometry } from "@/lib/image-crop";
import { cn } from "@/lib/utils";

export interface ImageCropperProps {
  file: File;
  /** Width ÷ height of the frame the member is asked to fill. */
  aspect: number;
  title: string;
  subtitle?: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
/** Crops are written at this width — sharp for a card, small enough to upload. */
const OUTPUT_WIDTH = 1280;

/**
 * Frame-filling cropper — no dependencies, works with touch, mouse and trackpad.
 *
 * The member drags the photo inside a frame that is already the right shape for
 * what we need (an ID-1 card is 1.586:1), zooms with the slider or a pinch, and
 * rotates a sideways card upright. The visible frame *is* the exported crop, so
 * there is no guesswork about what Rabi will see.
 */
export default function ImageCropper({
  file,
  aspect,
  title,
  subtitle,
  onCancel,
  onConfirm,
}: ImageCropperProps) {
  const nonce = useCspNonce();
  const cropId = useId().replace(/:/g, "");
  // Keep the crop frame visible even when a browser/extension strips our nonce
  // stylesheet; this aspect-ratio class is a CSS fallback, not an inline style.
  const frameAspectClass = aspect > 1.45 ? "aspect-[1.586]" : aspect < 1 ? "aspect-[0.8]" : "aspect-[4/3]";
  const frameRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ distance: 0, zoom: 1, offset: { x: 0, y: 0 }, origin: { x: 0, y: 0 } });

  /* ---------------------------------------------------------------- loading */
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const element = new window.Image();
    element.decoding = "async";
    element.onload = () => setImage(element);
    element.onerror = () => setLoadError(true);
    element.src = url;

    return () => {
      element.onload = null;
      element.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  /* ------------------------------------------------------------ frame size */
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    const measure = () => {
      const width = node.clientWidth;
      setFrameSize({ width, height: Math.round(width / aspect) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [aspect]);

  /* ------------------------------------------------------------- geometry */
  const geometry = useMemo(
    () =>
      cropGeometry({
        frameWidth: frameSize.width,
        frameHeight: frameSize.height,
        imageWidth: image?.naturalWidth ?? 0,
        imageHeight: image?.naturalHeight ?? 0,
        zoom,
        rotation,
      }),
    [image, frameSize, zoom, rotation]
  );

  // Keep the photo covering the frame whenever the zoom or rotation changes.
  const maxX = geometry.maxX;
  const maxY = geometry.maxY;
  useEffect(() => {
    setOffset((current) => clampCropOffset(current, { scale: 0, baseScale: 0, maxX, maxY }));
  }, [maxX, maxY]);

  /* --------------------------------------------------------------- gestures */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      gesture.current.offset = offset;
      gesture.current.origin = { x: event.clientX, y: event.clientY };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current.distance = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.zoom = zoom;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      const dx = event.clientX - gesture.current.origin.x;
      const dy = event.clientY - gesture.current.origin.y;
      setOffset(clampCropOffset({ x: gesture.current.offset.x + dx, y: gesture.current.offset.y + dy }, geometry));
      return;
    }

    if (pointers.current.size === 2 && gesture.current.distance > 0) {
      const [a, b] = Array.from(pointers.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clamp(
        gesture.current.zoom * (distance / gesture.current.distance),
        MIN_ZOOM,
        MAX_ZOOM
      );
      setZoom(next);
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 1) {
      const [remaining] = Array.from(pointers.current.values());
      gesture.current.offset = offset;
      gesture.current.origin = { x: remaining.x, y: remaining.y };
    }
  };

  /* ------------------------------------------------------------------ export */
  const exportCrop = useCallback(() => {
    if (!image || !frameSize.width) return;
    setSaving(true);

    const scale = geometry.scale;
    const ratio = OUTPUT_WIDTH / frameSize.width;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_WIDTH;
    canvas.height = Math.round(frameSize.height * ratio);

    const context = canvas.getContext("2d");
    if (!context) {
      setSaving(false);
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.translate(canvas.width / 2 + offset.x * ratio, canvas.height / 2 + offset.y * ratio);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(scale * ratio, scale * ratio);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

    canvas.toBlob(
      (blob) => {
        setSaving(false);
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.92
    );
  }, [image, frameSize, geometry.scale, offset, rotation, onConfirm]);

  /* --------------------------------------------------------------- keyboard */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter") exportCrop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, exportCrop]);

  // Lock the page behind the dialog.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/80 p-3 backdrop-blur-md sm:items-center"
    >
      <div className="lg-surface w-full max-w-md rounded-3xl p-4 text-white shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg leading-tight">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              {subtitle ?? "Drag the photo to fit the frame, then confirm."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel cropping"
            className="rounded-xl bg-white/5 p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Runtime crop geometry is emitted in a nonce-authorized stylesheet;
            style attributes are blocked by the production CSP. */}
        {nonce && image && (
          <style nonce={nonce}>{`.crop-frame-${cropId}{cursor:grab}.crop-image-${cropId}{width:${image.naturalWidth}px;height:${image.naturalHeight}px;transform:translate(-50%,-50%) translate(${offset.x}px,${offset.y}px) rotate(${rotation}deg) scale(${geometry.scale});transform-origin:center center}`}</style>
        )}
        {/* Frame — whatever is visible here is exactly what gets uploaded. */}
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          className={`crop-frame-${cropId} ${frameAspectClass} relative w-full touch-none select-none overflow-hidden rounded-2xl bg-black/60`}
        >
          {image && frameSize.width > 0 && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image.src}
              alt="Crop preview of selected document"
              draggable={false}
              width={image.naturalWidth}
              height={image.naturalHeight}
              className={`crop-image-${cropId} absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2`}
            />
          )}

          {!image && !loadError && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-red-300">
              That photo could not be opened. Try a different one.
            </div>
          )}

          {/* Rule-of-thirds guidance + corner brackets */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/12" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/12" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/12" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/12" />
            <span className="absolute left-2 top-2 h-5 w-5 rounded-tl-md border-l-2 border-t-2 border-white/70" />
            <span className="absolute right-2 top-2 h-5 w-5 rounded-tr-md border-r-2 border-t-2 border-white/70" />
            <span className="absolute bottom-2 left-2 h-5 w-5 rounded-bl-md border-b-2 border-l-2 border-white/70" />
            <span className="absolute bottom-2 right-2 h-5 w-5 rounded-br-md border-b-2 border-r-2 border-white/70" />
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center gap-3">
          <ZoomIn className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Zoom"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-emerald-400"
          />
          <button
            type="button"
            onClick={() => setRotation((value) => (value + 90) % 360)}
            aria-label="Rotate photo"
            className="rounded-xl bg-white/5 p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={exportCrop}
            disabled={!image || saving}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all",
              "bg-gradient-to-r from-primary via-emerald-400 to-gold-accent text-[#04150c]",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? "Preparing…" : "Use this photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
