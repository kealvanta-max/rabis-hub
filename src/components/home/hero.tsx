"use client";

import Link from "next/link";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { HeroHighlight, Highlight } from "@/components/ui/hero-highlight";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { motion } from "framer-motion";

export default function HeroSection() {
  return (
    <HeroHighlight>
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <BackgroundBeams />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_#D4AF37]" />
            <span className="text-xs font-semibold text-primary tracking-widest uppercase font-grotesk">
              Trusted by 2,000+ Savers Across Ghana
            </span>
          </motion.div>

          {/* Heading */}
          <div className="mb-6">
            <TextGenerateEffect 
              words="Build Your Future. Save Together."
              className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-tight text-white mb-2"
            />
            <motion.h2 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 1 }}
              className="text-2xl md:text-3xl font-display italic text-primary/80"
            >
              Experience the New Standard of <Highlight className="text-white italic px-4">Susu Savings</Highlight>
            </motion.h2>
          </div>

          {/* Subheading */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.8 }}
            className="max-w-2xl mx-auto text-gray-400 text-lg md:text-xl mb-12 leading-relaxed font-sans"
          >
            Join Ghana&apos;s premier digital savings community. Secure, transparent, and built for your financial growth.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.8, duration: 0.5 }}
            className="flex flex-col sm:flex-row gap-6 justify-center items-center"
          >
            <Link href="/auth?mode=signup">
              <ShimmerButton className="shadow-2xl">
                <span className="whitespace-pre-wrap text-center text-sm font-bold leading-none tracking-tighter text-white lg:text-lg">
                  Start Your Journey
                </span>
              </ShimmerButton>
            </Link>
            
            <Link
              href="/#plans"
              className="group relative px-8 py-3.5 text-base font-medium rounded-full text-white/70 hover:text-primary transition-colors overflow-hidden"
            >
              <span className="relative z-10">View Plans</span>
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 w-full h-[1px] bg-primary/30 group-hover:bg-primary transition-all" />
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 1 }}
            className="mt-20 grid grid-cols-3 gap-8 md:gap-12 max-w-2xl mx-auto border-t border-white/5 pt-12"
          >
            <StatItem value="2K+" label="Active Members" />
            <StatItem value="₵5M+" label="Total Saved" />
            <StatItem value="98%" label="Success Rate" />
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-grotesk">Scroll to Explore</span>
          <div className="w-[1px] h-12 bg-gradient-to-b from-primary/50 to-transparent" />
        </motion.div>
      </section>
    </HeroHighlight>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center group cursor-default">
      <p className="text-3xl md:text-4xl font-display gold-text-gradient group-hover:scale-110 transition-transform duration-300">{value}</p>
      <p className="text-[10px] md:text-xs text-gray-500 mt-2 uppercase tracking-widest font-grotesk">{label}</p>
    </div>
  );
}

