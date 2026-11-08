"use client";

import { useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCssVars } from "@/lib/css-vars";

export type FaceIdTilePhase = "idle" | "scanning" | "success";

interface FaceIdTileProps {
  /** Controlled phase. */
  phase?: FaceIdTilePhase;
  /** Called with the tap that starts the camera. */
  onActivate?: () => void;
  size?: number;
  label?: string;
  className?: string;
}

const PILL: Record<FaceIdTilePhase, string> = {
  idle: "bg-white/10 text-white/70",
  scanning: "bg-cyan-400/15 text-cyan-200",
  success: "bg-emerald-400/15 text-emerald-300",
};

/**
 * The Face ID panel, without a renderer.
 *
 * This used to be a real 3D scene: react-three-fiber, drei, a transmission-glass
 * shader and an HDR download. It looked superb on a desktop and it took the whole
 * signup down on a phone, three separate ways (a failed HDR fetch, a GPU without
 * WebGL2, a chunk that 404s after a redeploy). Decoration is not allowed to cost a
 * member her registration, so the panel is now CSS, SVG and a tap target. Same
 * shape, same glass, same motion, no renderer, no network, nothing to fail.
 */
export default function FaceIdTile({
  phase = "idle",
  onActivate,
  size = 186,
  label = "Tap to start your face check",
  className,
}: FaceIdTileProps) {
  const interactive = phase === "idle" && typeof onActivate === "function";
  const tileRef = useRef<HTMLButtonElement>(null);
  useCssVars(tileRef, { "--tile-size": `${size}px` }, [size]);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <button
        ref={tileRef}
        type="button"
        onClick={onActivate}
        disabled={!interactive}
        aria-label={
          phase === "idle" ? label : phase === "scanning" ? "Scanning" : "Scan complete"
        }
        className={cn(
          // Size arrives as custom properties (see CssVarBox for why a style
          // attribute cannot be used): the policy blocks attributes, not the
          // CSSOM, so these are written from an effect.
          "h-[var(--tile-size)] w-[var(--tile-size)]",
          "relative overflow-hidden rounded-3xl border border-white/15 bg-black/45",
          "shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl",
          interactive && "active:scale-[0.985] transition-transform",
          !interactive && "cursor-default"
        )}
      >
        {/* Glass core: one blurred radial, tinted by phase. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-6 rounded-full blur-2xl",
            phase === "scanning" && "animate-pulse",
            // One class per phase instead of a computed gradient string, so the
            // tint is in the shipped stylesheet and needs no runtime value.
            phase === "idle" && "face-tile-glow-idle",
            phase === "scanning" && "face-tile-glow-scanning",
            phase === "success" && "face-tile-glow-success"
          )}
        />

        {/* Studio highlight, so the glass reads as a surface and not a disc. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-gradient-to-br from-white/12 via-transparent to-white/[0.04]"
        />

        {/* Corner brackets. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-1.5">
          <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-[10px] border-l-2 border-t-2 border-white/80" />
          <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-[10px] border-r-2 border-t-2 border-white/80" />
          <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-[10px] border-b-2 border-l-2 border-white/80" />
          <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-[10px] border-b-2 border-r-2 border-white/80" />
        </span>

        {/* Face glyph, replaced by a check once the clip is safe. */}
        <span className="absolute inset-0 grid place-items-center">
          {phase === "success" ? (
            <Check className="h-16 w-16 text-emerald-300" strokeWidth={2.5} />
          ) : (
            <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
              <g stroke="white" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.92}>
                <path d="M32 44c0-6.6 5.4-12 12-12s12 5.4 12 12" />
                <path d="M20 44c0-6.6 5.4-12 12-12" />
                <path d="M14 20v-4a2 2 0 0 1 2-2h4" />
                <path d="M44 14h4a2 2 0 0 1 2 2v4" />
              </g>
              <circle cx="27" cy="34" r="1.8" fill="white" />
              <circle cx="37" cy="34" r="1.8" fill="white" />
            </svg>
          )}
        </span>

        {/* Status pill. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
              PILL[phase]
            )}
          >
            {phase === "success" ? "Verified" : phase === "scanning" ? "Scanning" : "Tap to scan"}
          </span>
        </span>
      </button>

      <p className="max-w-[260px] text-center text-xs leading-relaxed text-gray-400">
        {phase === "success"
          ? "That is you, your identity check is complete."
          : phase === "scanning"
          ? "Hold still while we check you are a real person."
          : label}
      </p>
    </div>
  );
}
