"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Honour `prefers-reduced-motion` for every framer-motion animation at once.
 *
 * The site already handles this in CSS: the glow shaders stop, the marquee
 * freezes, and `globals.css` has a `@media (prefers-reduced-motion: reduce)`
 * block. The JavaScript animations were the gap. Each section entrance, each
 * hover spring and each layout slide still ran for someone who had told the
 * operating system that motion makes them unwell.
 *
 * Two components handled it by hand (`useReducedMotion` in the tab bar and the
 * glass nav), which is exactly the kind of thing that is right in two places and
 * forgotten in the other nine. Wrapping the tree in `MotionConfig` fixes all of
 * them at the source, and it also disables the transform animations, not just
 * the opacity ones.
 *
 * `reducedMotion="user"` is framer-motion's own reading of the media query, so
 * there is no state, no listener and no client re-render to maintain.
 */
export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
