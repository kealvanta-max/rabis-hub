"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useRef, useState } from "react";

export const InfiniteMovingCards = ({
  items,
  direction = "left",
  speed = "fast",
  pauseOnHover = true,
  className,
}: {
  items: {
    quote: string;
    name: string;
    title: string;
  }[];
  direction?: "left" | "right";
  speed?: "fast" | "normal" | "slow";
  pauseOnHover?: boolean;
  className?: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [start, setStart] = useState(false);

  const getDirection = React.useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty(
        "--animation-direction",
        direction === "left" ? "forwards" : "reverse"
      );
    }
  }, [direction]);

  const getSpeed = React.useCallback(() => {
    if (containerRef.current) {
      const dur = speed === "fast" ? "15s" : speed === "normal" ? "25s" : "40s";
      containerRef.current.style.setProperty("--animation-duration", dur);
    }
  }, [speed]);

  const addAnimation = React.useCallback(() => {
    if (containerRef.current && scrollerRef.current) {
      // React 18 StrictMode mounts effects twice in development – guard so the
      // cards are only duplicated once and the marquee keeps its speed.
      if (scrollerRef.current.dataset.cloned === "true") return;
      const scrollerContent = Array.from(scrollerRef.current.children);
      // Clone items to create seamless infinite loop
      scrollerContent.forEach((item) => {
        const duplicatedItem = item.cloneNode(true);
        if (scrollerRef.current) {
          scrollerRef.current.appendChild(duplicatedItem);
        }
      });
      scrollerRef.current.dataset.cloned = "true";
      getDirection();
      getSpeed();
      setStart(true);
    }
  }, [getDirection, getSpeed]);

  useEffect(() => {
    addAnimation();
  }, [addAnimation]);

  return (
    <div
      ref={containerRef}
      // The fade-out edges live in the shipped stylesheet (`.scroller`), because
      // a style attribute is blocked by the production CSP and the marquee ran
      // edge-to-edge with hard cuts instead of fading.
      className={cn(
        "scroller relative z-20 max-w-7xl overflow-hidden",
        className
      )}
    >
      <ul
        ref={scrollerRef}
        // `touch-action: pan-y` prevents the marquee swallowing scroll gestures
        // on Android; it is now a utility class rather than a style attribute.
        className={cn(
          "flex min-w-full shrink-0 gap-4 py-4 w-fit flex-nowrap touch-pan-y",
          start && "animate-scroll",
          // Only pause on DESKTOP hover (md:), not on mobile touch.
          pauseOnHover && "md:hover:[animation-play-state:paused]"
        )}
      >
        {items.map((item, idx) => (
          <li
            key={`${item.name}-${idx}`}
            className="testimonial-card w-[320px] sm:w-[380px] md:w-[450px] max-w-full relative rounded-2xl border border-b-0 flex-shrink-0 border-[#065F46]/60 px-6 py-6"
          >
            <blockquote>
              {/* Decorative quote mark */}
              <div
                aria-hidden="true"
                className="absolute top-4 right-5 text-5xl text-primary/20 font-display leading-none select-none"
              >
                &ldquo;
              </div>
              <span className="relative z-20 text-sm leading-[1.8] text-gray-300 font-normal italic block mb-6">
                &ldquo;{item.quote}&rdquo;
              </span>
              <div className="relative z-20 flex flex-row items-center gap-3">
                {/* Avatar initial circle */}
                <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-sm">
                    {item.name.charAt(0)}
                  </span>
                </div>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm leading-[1.6] text-primary font-bold">
                    {item.name}
                  </span>
                  <span className="text-xs leading-[1.6] text-gray-400 font-normal">
                    {item.title}
                  </span>
                </span>
              </div>
            </blockquote>
          </li>
        ))}
      </ul>
    </div>
  );
};
