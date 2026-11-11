"use client";

import Link from "next/link";
import Image from "next/image";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { useTranslation } from "@/context/i18n-context";
import { useEffect, useState } from "react";
import { LottiePlayer } from "@/components/ui/lottie-player";
import savingsAnimation from "../../../public/animations/savings-hero.json";

/*
 * The first screen, built to paint immediately.
 *
 * Everything here used to fade in from `opacity: 0` on a timer, and the page
 * sat behind a full screen "Akwaaba" gate until somebody tapped Enter. Both are
 * fatal for Largest Contentful Paint, because a browser will not count a
 * heading as painted until it is actually visible. On a mid range Android that
 * pushed the largest paint out past five seconds.
 *
 * So the words are now in the document, visible, with no entrance animation and
 * no gate. Motion is limited to decoration that has already been composited and
 * to the gentle float on the globe, which cannot delay a paint.
 */

/*
 * Three facts, no invented ones.
 *
 * This used to read "2K+ members", "GH₵5M+ saved" and a "98% success rate".
 * None of them were true, none were sourced, and a visitor who does the maths on
 * a GH₵6 plan can see they do not add up. Worse, the last one is a performance
 * promise about other people's money, which nobody here is in a position to make.
 *
 * What is left is checkable from this app: the floor price Rabi actually quotes,
 * when a round pays out, and the fact that a person answers. Those are the
 * things a new member is really deciding on.
 */
const STATS = [
  { key: "hero_stat_members" as const, value: "GH₵6", unit: "a day, the smallest plan" },
  { key: "hero_stat_saved" as const, value: "5 days", unit: "one daily round, then you are paid" },
  { key: "hero_stat_rate" as const, value: "WhatsApp", unit: "Rabi answers personally" },
];

export default function HeroSection() {
  const { t } = useTranslation();

  /*
   * The Lottie scene is roughly 78 KiB of animation runtime and it is hidden
   * below 768px anyway, yet it was being downloaded, parsed and started on
   * every phone. It now mounts only where it can be seen, and never on a device
   * that asked for less motion. The placeholder keeps the column height, so
   * nothing moves when it arrives.
   */
  const [showScene, setShowScene] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const wide = window.matchMedia("(min-width: 768px)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setShowScene(wide.matches && !still.matches);
    update();
    wide.addEventListener?.("change", update);
    still.addEventListener?.("change", update);
    return () => {
      wide.removeEventListener?.("change", update);
      still.removeEventListener?.("change", update);
    };
  }, []);

  return (
    <section className="relative min-h-[100svh] flex items-center overflow-hidden pt-20 bg-shader-gradient hero-dots">
      <BackgroundBeams />
      <Spotlight className="-top-40 left-0 md:left-20 md:-top-20" fill="white" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8 h-full min-h-[70vh]">

          {/* Left column: the message, readable before any JavaScript runs */}
          <div className="flex-1 text-center lg:text-left flex flex-col justify-center items-center lg:items-start pt-10 md:pt-0">

            <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4 py-1.5 rounded-full border border-primary/40 bg-primary/10 mb-6 md:mb-8 glass-card">
              <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
              <span className="text-[11px] md:text-xs font-semibold text-white tracking-widest uppercase font-grotesk">
                {t.hero_badge}
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1.1] text-white mb-2 max-w-[22ch]">
              {t.hero_heading}
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-primary/90 mt-4 mb-4 font-medium">
              {t.hero_subheading}{" "}
              <span className="text-white italic px-2 rounded-lg bg-primary/20">{t.hero_susu}</span>
            </p>

            <p className="max-w-xl text-gray-200 text-sm sm:text-base md:text-lg mb-8 md:mb-10 leading-relaxed font-sans">
              <span className="block font-semibold text-white text-base sm:text-lg">
                The susu you already know, with a record you can check.
              </span>
              <span className="mt-2 block">{t.hero_description}</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center lg:justify-start w-full sm:w-auto">
              <Link href="/auth?mode=signup" prefetch={false} className="w-full sm:w-auto">
                <ShimmerButton className="shadow-[0_0_40px_-10px_rgba(250,204,21,0.4)] w-full sm:w-auto">
                  <span className="whitespace-normal text-center text-sm md:text-base font-bold leading-none tracking-tighter text-white">
                    {t.hero_cta}
                  </span>
                </ShimmerButton>
              </Link>

              <Link
                href="/guide"
                prefetch={false}
                className="group relative px-8 py-3.5 text-sm md:text-base font-medium rounded-full text-white hover:text-white transition-colors overflow-hidden text-center w-full sm:w-auto flex items-center justify-center border border-white/20 hover:border-primary/50 glass-card"
              >
                <span className="relative z-10">How It Works</span>
              </Link>
            </div>

            <dl className="mt-12 md:mt-16 grid grid-cols-3 gap-4 sm:gap-8 md:gap-10 w-full max-w-lg border-t border-white/10 pt-8">
              {STATS.map((stat) => (
                <div key={stat.value} className="text-center lg:text-left">
                  {/*
                    dd before dt is valid inside a single div wrapper per HTML5,
                    and the visual order is deliberate. The label is above the
                    value here because "Plans from" then "GH₵6" reads as a
                    sentence, which is how it is spoken to a reader.
                  */}
                  <dt className="text-[11px] text-gray-300 uppercase tracking-[0.14em] font-grotesk">{t[stat.key]}</dt>
                  <dd className="mt-1 text-lg sm:text-xl md:text-2xl font-semibold text-primary">{stat.value}</dd>
                  <dd className="mt-0.5 text-[11px] leading-snug text-gray-300">{stat.unit}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right column: decoration, never the largest paint */}
          <div className="flex-1 w-full h-[300px] sm:h-[400px] lg:h-[600px] relative mt-8 lg:mt-0">
            <div className="hidden md:block w-full h-full relative z-20 mix-blend-screen">
              {showScene ? (
                <LottiePlayer
                  animationData={savingsAnimation}
                  className="w-full h-full max-h-[500px] object-contain drop-shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                />
              ) : null}
            </div>

            <div className="md:hidden w-full h-full flex items-center justify-center relative">
              <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] rounded-full animate-[float_5s_ease-in-out_infinite]">
                <Image
                  src="/images/ghana-globe.webp"
                  alt="A stylised globe of Ghana, the home of Rabi's Saving Hub"
                  width={320}
                  height={320}
                  sizes="(max-width: 640px) 280px, 320px"
                  priority
                  fetchPriority="high"
                  unoptimized
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-primary/15 blur-[100px] rounded-full pointer-events-none -z-10"
            />
          </div>

        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex-col items-center gap-2 hidden sm:flex">
        <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-grotesk">{t.hero_scroll}</span>
        <div className="w-[1px] h-10 bg-gradient-to-b from-primary/50 to-transparent" aria-hidden="true" />
      </div>
    </section>
  );
}
