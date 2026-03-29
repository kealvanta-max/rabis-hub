"use client";

import { useRef } from "react";

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // The hidden play UI is no longer needed since it operates via the Loading Screen only
  return (
    <div className="hidden" aria-hidden="true">
      <audio 
        ref={audioRef}
        id="welcomeAudio" 
        preload="auto" 
      >
        <source 
          src="https://www.dropbox.com/scl/fi/pi2fdbqjsg9z6hzsneqlw/ElevenLabs_2026-02-21T13_12_24_Hope-Professional-Clear-and-Natural_pvc_sp100_s50_sb75_v3-1.mp3?rlkey=rmqcnld6knfbjjd8156b1ypid&st=61tmq6l7&dl=1" 
          type="audio/mpeg" 
        />
      </audio>
    </div>
  );
}
