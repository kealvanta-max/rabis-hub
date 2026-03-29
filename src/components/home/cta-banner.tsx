"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MoveRight } from "lucide-react";

export default function CTABanner() {
  return (
    <section className="py-24 relative overflow-hidden bg-navy-dark">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-navy-light/50 pointer-events-none" />
      
      {/* Decorative Blur */}
      <div className="absolute -bottom-[20rem] -left-[10rem] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="bg-navy-light/40 backdrop-blur-xl border border-white/10 rounded-3xl p-10 md:p-16 shadow-2xl"
        >
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-6"
          >
            Ready to Start Your <br/> <span className="gold-text-gradient">Savings Journey?</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto"
          >
            Join over 2,000+ trusted members building generational wealth together. Your future self will thank you.
          </motion.p>
          <motion.div
             initial={{ opacity: 0, y: 20 }}
             whileInView={{ opacity: 1, y: 0 }}
             viewport={{ once: true }}
             transition={{ delay: 0.3 }}
          >
            <Link
              href="/auth?mode=signup"
              className="group inline-flex items-center gap-3 px-10 py-4 text-base font-bold rounded-full bg-primary text-navy-dark hover:scale-105 transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)]"
            >
              Join Rabi&apos;s Saving Hub
              <MoveRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

