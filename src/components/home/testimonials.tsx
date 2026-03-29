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
          <div className="relative flex flex-col antialiased bg-navy-dark items-center justify-center overflow-hidden">
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

