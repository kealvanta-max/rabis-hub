"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const Lottie = dynamic(() => import("lottie-react"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
    </div>
  )
});

interface LottiePlayerProps {
  animationData: any;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

export function LottiePlayer({ animationData, loop = true, autoplay = true, className }: LottiePlayerProps) {
  return (
    <div className={cn("h-full w-full", className)}>
      <Lottie
        animationData={animationData}
        loop={loop}
        autoplay={autoplay}
        // `style` would be blocked by `style-src-attr 'none'`. The wrapper owns
        // the box and the animation fills it through shipped classes.
        className="h-full w-full"
      />
    </div>
  );
}
