"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface MemberAvatarProps {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}

/**
 * Square avatar that can never stretch.
 *
 * The frame owns the aspect ratio (`aspect-square` + `overflow-hidden`) and the
 * image is absolutely positioned inside it with `object-cover`, so a portrait,
 * a panorama or a half-uploaded file still renders as a crisp square instead of
 * a squashed oval. If the file cannot load we fall back to initials rather than
 * showing a broken-image glyph.
 */
export default function MemberAvatar({ name, src, size = 48, className }: MemberAvatarProps) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const showImage = Boolean(src) && !broken;

  return (
    <div
      className={cn(
        "relative aspect-square shrink-0 overflow-hidden rounded-xl bg-emerald-500/10 ring-1 ring-inset ring-white/10",
        className
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <Image
          src={src as string}
          alt={name ? `${name}'s photo` : "Member photo"}
          fill
          sizes={`${size}px`}
          unoptimized={(src as string).startsWith("data:")}
          onError={() => setBroken(true)}
          className="object-cover object-center"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid h-full w-full place-items-center font-grotesk text-sm font-bold text-emerald-300"
        >
          {initial}
        </span>
      )}
    </div>
  );
}
