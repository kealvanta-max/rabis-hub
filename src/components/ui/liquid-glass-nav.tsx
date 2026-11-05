"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface LiquidGlassNavItem {
  href: string;
  label: string;
}

interface LiquidGlassNavProps {
  items: LiquidGlassNavItem[];
  /** Currently active route, used when nothing is hovered. */
  activeHref?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Heavy-liquid spring: mass 0.5 / damping 15 / stiffness 100.
 * Slow to start, settles without wobble — the pill behaves like a drop of
 * mercury rather than a cursor follower.
 */
const LIQUID_SPRING = { type: "spring" as const, mass: 0.5, damping: 15, stiffness: 100 };

/**
 * Apple-style liquid glass navigation pill.
 *
 * The optical model lives in `globals.css` (`.lg-surface` + `--lg-*` tokens):
 * translucent body, 25px blur at 180% saturation, a 1px light bevel on top and
 * a 1px shade underneath, plus a masked specular gradient over the top half so
 * the surface reads as curved glass. Nothing here uses a plain drop shadow or a
 * full-width decorative gradient.
 */
export default function LiquidGlassNav({
  items,
  activeHref,
  className,
  ariaLabel = "Sections",
}: LiquidGlassNavProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const pillId = useId();

  const highlighted = hovered ?? focused ?? activeHref ?? null;

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "lg-surface flex items-center gap-0.5 rounded-full p-1.5",
        className
      )}
      onMouseLeave={() => setHovered(null)}
    >
      {items.map((item) => {
        const isHighlighted = highlighted === item.href;
        const isActive = activeHref === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            onMouseEnter={() => setHovered(item.href)}
            onFocus={() => setFocused(item.href)}
            onBlur={() => setFocused(null)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium",
              "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
              "transition-colors duration-200"
            )}
            style={{
              color: isHighlighted ? "var(--lg-ink-active)" : "var(--lg-ink-muted)",
            }}
          >
            {isHighlighted && (
              <motion.span
                layoutId={`${pillId}-pill`}
                className="lg-pill pointer-events-none absolute inset-0 rounded-full"
                transition={
                  reducedMotion ? { duration: 0 } : LIQUID_SPRING
                }
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
