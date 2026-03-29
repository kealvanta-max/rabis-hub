"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function CalculatorSection() {
  const [contribution, setContribution] = useState(6);
  const [days, setDays] = useState(5);
  const [slots, setSlots] = useState(15);
  const [total, setTotal] = useState(6 * 5 * 15);

  useEffect(() => {
    setTotal(contribution * days * slots);
  }, [contribution, days, slots]);

  return (
    <section id="calculator" className="py-24 bg-navy-dark relative overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-primary text-sm font-semibold tracking-widest uppercase mb-3 font-grotesk"
          >
            Wealth Projection
          </motion.p>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-6"
          >
            See Your <span className="gold-text-gradient">Savings Grow</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-gray-400 max-w-xl mx-auto text-lg"
          >
            Use our animated projection engine to visualize the precise growth of your strategic contributions.
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto relative group"
        >
          {/* Animated Border gradient */}
          <div className="absolute -inset-1 bg-gradient-to-r from-primary via-navy-light to-primary rounded-[2rem] blur-md opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          
          <div className="relative bg-navy-light/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 md:p-12 shadow-2xl">
            <div className="space-y-8">
              {/* Contribution */}
              <div>
                <label className="flex items-center justify-between text-sm text-gray-300 mb-4">
                  <span className="font-grotesk tracking-wide text-white font-medium">Daily Contribution</span>
                  <span className="font-bold text-primary text-lg">GH₵{contribution}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={contribution}
                  onChange={(e) => setContribution(Number(e.target.value))}
                  className="w-full h-2 bg-navy-dark rounded-lg appearance-none cursor-pointer accent-primary border border-white/5"
                />
              </div>

              {/* Days */}
              <div>
                <label className="flex items-center justify-between text-sm text-gray-300 mb-4">
                  <span className="font-grotesk tracking-wide text-white font-medium">Number of Days</span>
                  <span className="font-bold text-primary text-lg">{days} days</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full h-2 bg-navy-dark rounded-lg appearance-none cursor-pointer accent-primary border border-white/5"
                />
              </div>

              {/* Slots */}
              <div>
                <label className="flex items-center justify-between text-sm text-gray-300 mb-4">
                  <span className="font-grotesk tracking-wide text-white font-medium">Number of Slots</span>
                  <span className="font-bold text-primary text-lg">{slots} slots</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={slots}
                  onChange={(e) => setSlots(Number(e.target.value))}
                  className="w-full h-2 bg-navy-dark rounded-lg appearance-none cursor-pointer accent-primary border border-white/5"
                />
              </div>

              {/* Result display */}
              <div className="pt-8 mt-8 border-t border-white/10 relative">
                <div className="absolute left-1/2 -top-3 -translate-x-1/2 bg-navy-dark px-4 py-1 rounded-full border border-white/10 text-[10px] text-gray-400 uppercase tracking-widest">
                  Projection
                </div>
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="text-gray-400 text-sm mb-2 font-medium">Estimated Total Returns</span>
                  <motion.div
                    key={total}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <span className="text-5xl md:text-7xl font-display font-bold gold-text-gradient drop-shadow-2xl">
                      GH₵{total.toLocaleString()}
                    </span>
                  </motion.div>
                </div>
                <p className="text-xs text-gray-500 mt-6 text-center italic opacity-60">
                  Formula: {contribution} (Amt) × {days} (Days) × {slots} (Slots)
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

