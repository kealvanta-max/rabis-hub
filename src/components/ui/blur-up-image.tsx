"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Cloudinary can hand back a tiny, heavily blurred copy of any image it hosts.
 *
 * That copy is usually a few hundred bytes and arrives instantly, so the member
 * sees the shape and colour of her photo immediately while the real file is
 * still travelling. The swap is a crossfade, not a pop-in, which is the whole
 * "blur-up" effect: the expensive thing appears to have always been there.
 */
export function blurPlaceholder(src: string): string | null {
  if (!src) return null;
  if (!/res\.cloudinary\.com/.test(src) || !src.includes("/upload/")) return null;

  // Chained transformation: Cloudinary reads them left to right, so this is a
  // 32 pixel wide copy blurred past recognition and squeezed to 20% quality.
  return src.replace("/upload/", "/upload/w_32,e_blur:800,q_20/");
}

interface BlurUpImageProps {
  src: string;
  alt: string;
  /** Classes for the image itself, e.g. sizing and object-fit. */
  className?: string;
  /** Classes for the wrapper, when the parent needs a full-height block. */
  wrapperClassName?: string;
  /** Above-the-fold images should not wait for the scroll position. */
  eager?: boolean;
}

export default function BlurUpImage({
  src,
  alt,
  className,
  wrapperClassName,
  eager = false,
}: BlurUpImageProps) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = blurPlaceholder(src);

  return (
    <span className={cn("relative block overflow-hidden bg-white/[0.04]", wrapperClassName)}>
      {placeholder && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-xl",
            "transition-opacity duration-700 ease-out",
            loaded ? "opacity-0" : "opacity-100"
          )}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={cn(
          "transition-[opacity,filter] duration-500 ease-out",
          loaded ? "opacity-100 blur-0" : "opacity-0 blur-md",
          className
        )}
      />
    </span>
  );
}
