"use client";
import React from "react";
import { cn } from "@/lib/utils";

export const BackgroundBeams = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "absolute inset-0 h-full w-full bg-transparent [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]",
        className
      )}
    >
      <div className="absolute inset-0 bg-dot-white/[0.2] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        fill="none"
        className="absolute inset-0 h-full w-full opacity-40"
      >
        <path
          d="M-100 900V0H1540V900H-100Z"
          fill="url(#beams-gradient)"
        />
        <defs>
          <radialGradient
            id="beams-gradient"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(720 450) rotate(90) scale(450 720)"
          >
            <stop stopColor="#10B981" stopOpacity="0.15" />
            <stop offset="1" stopColor="#10B981" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
};
