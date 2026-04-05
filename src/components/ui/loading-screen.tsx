"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield } from "lucide-react";
import { useTranslation } from "@/context/i18n-context";

export default function LoadingScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setMounted(true);
    // Hide scrollbar while loading screen is active
    if (isVisible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isVisible]);

  const handleEnter = () => {
    // Play audio
    const audioEl = document.getElementById("welcomeAudio") as HTMLAudioElement | null;
    if (audioEl) {
      audioEl.volume = 0.5; // Set reasonable volume
      audioEl.play().catch((err) => {
        console.warn("Audio autoplay blocked or failed:", err);
      });
    }
    
    // Animate out
    setIsVisible(false);
  };

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="loading-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: "-100%" }}
            transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#020c06] text-white overflow-hidden"
          >
            {/* Subtle background pattern or glow for Ghana vibe */}
            <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/20 via-[#020c06] to-[#020c06]"></div>

            {/* Emerald dust / particles effect */}
            <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #10B981 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 1, ease: "easeOut" }}
              className="flex flex-col items-center z-10"
            >
            {/* Logo */}
            <div className="relative mb-6">
              <div className="absolute -inset-10 bg-primary/20 blur-3xl rounded-full animate-pulse"></div>
              <div className="relative transform hover:scale-105 transition-transform duration-500 flex items-center justify-center">
                {/* @ts-ignore */}
                <lord-icon
                    src="https://cdn.lordicon.com/eaegfqtv.json"
                    trigger="hover"
                    colors="primary:#10B981,secondary:#ffffff"
                    style={{ width: "250px", height: "250px" }}>
                {/* @ts-ignore */}
                </lord-icon>
              </div>
            </div>

            {/* Typography */}
            <div className="text-center space-y-4 mb-14">
              <motion.h1 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className="text-6xl md:text-8xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-primary to-emerald-500 font-serif"
                style={{ textShadow: '0 4px 20px rgba(16, 185, 129, 0.2)' }}
              >
                {t.loading_akwaaba}
              </motion.h1>
              <div className="flex flex-col items-center space-y-2">
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.8, duration: 0.8 }}
                  className="text-lg md:text-xl text-gray-300 font-light tracking-[0.2em] md:tracking-[0.3em] uppercase"
                >
                  {t.loading_welcome}
                </motion.p>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.9, duration: 0.8 }}
                  className="text-sm md:text-base text-primary/80 font-medium tracking-wide"
                >
                  {t.loading_subtitle}
                </motion.p>
              </div>
            </div>

            {/* Enter Button */}
            <motion.button
              initial={{ y: 20, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 1.2, duration: 0.6 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleEnter}
              className="group relative px-10 py-4 bg-transparent overflow-hidden rounded-full border border-primary/40 hover:border-primary shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all duration-300 backdrop-blur-sm tracking-widest uppercase text-sm"
            >
              <div className="absolute inset-0 w-0 bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500 ease-out group-hover:w-full opacity-90"></div>
              <span className="relative text-primary group-hover:text-white font-bold transition-colors duration-300 flex items-center gap-3">
                <span>{t.loading_enter}</span>
                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            </motion.button>
          </motion.div>
          
          {/* Decor element - Adinkra-inspired dots or motifs */}
          <div className="absolute bottom-12 left-0 right-0 flex justify-center space-x-3 opacity-60">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  delay: 1.5 + i * 0.2, 
                  duration: 0.5,
                  repeat: Infinity,
                  repeatType: "reverse",
                  repeatDelay: 2
                }}
                className={`w-2 h-2 rounded-full ${i === 1 ? 'bg-gold-accent' : 'bg-primary/50'}`}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
