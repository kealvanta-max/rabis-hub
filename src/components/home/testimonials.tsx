"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { TestimonialDoc } from "@/lib/types";
import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";
import { motion } from "framer-motion";

export default function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState<TestimonialDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTestimonials() {
      try {
        const q = query(
          collection(db, "testimonials"),
          where("status", "==", "approved"),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TestimonialDoc));
        setTestimonials(data);
      } catch (err) {
        console.error("Error fetching testimonials:", err);
        setTestimonials(placeholderTestimonials);
      } finally {
        setLoading(false);
      }
    }
    fetchTestimonials();
  }, []);

  const displayData = testimonials.length > 0 ? testimonials : placeholderTestimonials;

  // Map to InfiniteMovingCards format
  const marqueeItems = displayData.map(t => ({
    quote: t.review,
    name: t.userName,
    title: t.planName
  }));

  return (
    <section id="testimonials" className="py-24 bg-navy-dark overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-primary text-sm font-semibold tracking-widest uppercase mb-3 font-grotesk"
          >
            Voice of the Community
          </motion.p>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-6"
          >
            Real Stories, <span className="gold-text-gradient">Real Results</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-gray-400 max-w-2xl mx-auto text-lg"
          >
            Join thousands of Ghanaians who have already transformed their savings habits with Rabi&apos;s Saving Hub.
          </motion.p>
        </div>

        {loading ? (
          <div className="h-[20rem] rounded-md flex flex-col antialiased bg-navy-dark items-center justify-center relative overflow-hidden">
             <div className="animate-pulse flex space-x-4">
                <div className="rounded-full bg-slate-700 h-10 w-10"></div>
                <div className="flex-1 space-y-6 py-1">
                  <div className="h-2 bg-slate-700 rounded"></div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="h-2 bg-slate-700 rounded col-span-2"></div>
                      <div className="h-2 bg-slate-700 rounded col-span-1"></div>
                    </div>
                    <div className="h-2 bg-slate-700 rounded"></div>
                  </div>
                </div>
              </div>
          </div>
        ) : (
          <div className="relative w-full">
            {/* Desktop Marquee */}
            <div className="hidden md:flex flex-col antialiased bg-navy-dark items-center justify-center overflow-hidden">
              <InfiniteMovingCards
                items={marqueeItems}
                direction="right"
                speed="slow"
                className="mt-4"
              />
              <InfiniteMovingCards
                items={[...marqueeItems].reverse()}
                direction="left"
                speed="normal"
                className="mt-10 opacity-50 blur-[1px] hover:blur-none transition-all duration-500"
              />
            </div>
            
            {/* Mobile Swipeable Cards */}
            <div className="md:hidden flex overflow-x-auto snap-x snap-mandatory gap-4 pb-8 pt-4 px-4 hide-scrollbar">
              {displayData.map((t, idx) => (
                <div key={t.id || idx} className="snap-center shrink-0 w-[85vw] max-w-[320px] bg-white/[0.04] border border-white/10 rounded-2xl p-6">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <svg key={i} className={`w-4 h-4 ${i < t.rating ? "text-primary" : "text-gray-700"}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-gray-300 text-sm italic mb-6 relative">
                    <span className="text-primary text-2xl absolute -left-2 -top-2 opacity-50">&quot;</span>
                    {t.review}
                    <span className="text-primary text-2xl absolute -right-2 bottom-0 opacity-50">&quot;</span>
                  </p>
                  <div className="flex items-center gap-3 border-t border-white/5 pt-4">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {t.userName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{t.userName}</p>
                      <p className="text-primary/80 text-xs">{t.planName}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const placeholderTestimonials: TestimonialDoc[] = [
  {
    userId: "static-1",
    userName: "Ama Serwah",
    userPhoto: "",
    planName: "Daily GH₵6",
    rating: 5,
    review: "I started with just GH₵6 a day and within months, I saw real returns. Rabi's Saving Hub made saving easy and transparent. Best decision I ever made!",
    status: "approved",
    isStatic: true,
    createdAt: Timestamp.fromDate(new Date("2024-01-01")),
  },
  {
    userId: "static-2",
    userName: "Kwame Asante",
    userPhoto: "",
    planName: "Weekly GH₵200",
    rating: 5,
    review: "The WhatsApp community is amazing. Everyone supports each other, and Rabi personally ensures everything is transparent. I trust this platform completely.",
    status: "approved",
    isStatic: true,
    createdAt: Timestamp.fromDate(new Date("2024-01-02")),
  },
  {
    userId: "static-3",
    userName: "Adwoa Mensah",
    userPhoto: "",
    planName: "Monthly GH₵600",
    rating: 4,
    review: "As a market woman in Kumasi, I needed a reliable susu. Rabi's Hub gives me peace of mind knowing my money is safe and growing every month.",
    status: "approved",
    isStatic: true,
    createdAt: Timestamp.fromDate(new Date("2024-01-03")),
  },
  {
    userId: "static-4",
    userName: "John Mensah",
    userPhoto: "",
    planName: "Daily",
    rating: 5,
    review: "The digital tracking is a game changer. I no longer have to worry about my susu book getting lost.",
    status: "approved",
    isStatic: true,
    createdAt: Timestamp.fromDate(new Date("2024-01-04")),
  },
];

