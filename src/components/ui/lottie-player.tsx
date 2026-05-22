"use client";

import dynamic from "next/dynamic";

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
    <div className={className}>
      <Lottie 
        animationData={animationData} 
        loop={loop} 
        autoplay={autoplay} 
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
