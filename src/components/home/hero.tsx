"use client";

import Link from "next/link";
import Image from "next/image";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { HeroHighlight, Highlight } from "@/components/ui/hero-highlight";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { motion } from "framer-motion";
import { useTranslation } from "@/context/i18n-context";
import { SplineScene } from "@/components/ui/splite";
import { Spotlight } from "@/components/ui/spotlight";

export default function HeroSection() {
  const { t } = useTranslation();
  return (
    <HeroHighlight>
      <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
        <BackgroundBeams />
        {/* Subtle spotlight for added drama behind the text */}
        <Spotlight className="-top-40 left-0 md:left-20 md:-top-20" fill="white" />
        
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8 h-full min-h-[70vh]">
            
            {/* Left Content Column (Typography & Action) */}
            <div className="flex-1 text-center lg:text-left flex flex-col justify-center items-center lg:items-start pt-10 md:pt-0">
              
              {/* Badge */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-6 md:mb-8 backdrop-blur-md"
              >
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_#D4AF37]" />
                <span className="text-[10px] md:text-xs font-semibold text-primary tracking-widest uppercase font-grotesk whitespace-nowrap">
                  {t.hero_badge}
                </span>
              </motion.div>

              {/* Heading */}
              <div className="mb-4 md:mb-6 max-w-3xl">
                <TextGenerateEffect 
                  words={t.hero_heading}
                  className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl leading-[1.1] text-white mb-2"
                />
                <motion.h2 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 1 }}
                  className="text-xl sm:text-2xl md:text-3xl font-display italic text-primary/80 mt-2"
                >
                  {t.hero_subheading} <Highlight className="text-white italic px-4">{t.hero_susu}</Highlight>
                </motion.h2>
              </div>

              {/* Subheading */}
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.8 }}
                className="max-w-xl text-gray-400 text-base sm:text-lg md:text-xl mb-8 md:mb-10 leading-relaxed font-sans"
              >
                {t.hero_description}
              </motion.p>

              {/* CTA Buttons */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.8, duration: 0.5 }}
                className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center lg:justify-start w-full sm:w-auto"
              >
                <Link href="/auth?mode=signup" className="w-full sm:w-auto">
                  <ShimmerButton className="shadow-[0_0_40px_-10px_rgba(212,175,55,0.4)] w-full sm:w-auto">
                    <span className="whitespace-nowrap text-center text-sm md:text-base font-bold leading-none tracking-tighter text-white">
                      {t.hero_cta}
                    </span>
                  </ShimmerButton>
                </Link>
                
                <Link
                  href="/#plans"
                  className="group relative px-8 py-3.5 text-sm md:text-base font-medium rounded-full text-white/80 hover:text-primary transition-colors overflow-hidden text-center w-full sm:w-auto flex items-center justify-center border border-white/10 hover:border-primary/50 bg-white/5 backdrop-blur-md"
                >
                  <span className="relative z-10">{t.hero_view_plans}</span>
                  <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Link>
              </motion.div>

              {/* Stats - Grid layout below CTAs for left-aligned flow */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.2, duration: 1 }}
                className="mt-12 md:mt-16 grid grid-cols-3 gap-4 sm:gap-8 md:gap-10 w-full max-w-lg border-t border-white/10 pt-8"
              >
                <StatItem value="2K+" label={t.hero_stat_members} />
                <StatItem value="₵5M+" label={t.hero_stat_saved} />
                <StatItem value="98%" label={t.hero_stat_rate} />
              </motion.div>
            </div>

            {/* Right Content Column (Visuals) */}
            <div className="flex-1 w-full h-[300px] sm:h-[400px] lg:h-[600px] relative mt-8 lg:mt-0">
              {/* Desktop 3D Scene */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, duration: 1.5 }}
                className="hidden md:block w-full h-full relative z-20"
              >
                 <SplineScene 
                  scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                  className="w-full h-full"
                />
              </motion.div>

              {/* Mobile Image Fallback (Globe) */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 1 }}
                className="md:hidden w-full h-full flex items-center justify-center relative"
              >
                <motion.div 
                  animate={{ y: [0, -15, 0] }}
                  transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                  className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] rounded-full"
                >
                  <Image 
                    src="/images/ghana-globe.png"
                    alt="Ghana Globe"
                    fill
                    className="object-contain drop-shadow-[0_0_30px_rgba(212,175,55,0.4)]"
                    priority
                  />
                </motion.div>
              </motion.div>

              {/* Decorative background glow behind the visual element */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-primary/20 blur-[100px] rounded-full pointer-events-none -z-10" />
            </div>

          </div>
        </div>

        {/* Scroll indicator - kept subtle at the bottom center */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3, duration: 1 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 hidden sm:flex"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-grotesk">{t.hero_scroll}</span>
          <div className="w-[1px] h-10 bg-gradient-to-b from-primary/50 to-transparent" />
        </motion.div>
      </section>
    </HeroHighlight>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center lg:text-left group cursor-default">
      <p className="text-2xl sm:text-3xl md:text-4xl font-display gold-text-gradient group-hover:scale-105 transition-transform duration-300 transform origin-left">{value}</p>
      <p className="text-[9px] sm:text-[10px] md:text-xs text-gray-500 mt-1 md:mt-2 uppercase tracking-widest font-grotesk line-clamp-1">{label}</p>
    </div>
  );
}
