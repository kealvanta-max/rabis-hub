"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function CalculatorSection() {
  const [mode, setMode] = useState<"standard" | "achiever">("standard");
  const [contribution, setContribution] = useState(23);
  const [days, setDays] = useState(5);
  const [slots, setSlots] = useState(15);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (mode === "standard") {
      setTotal(contribution * days * slots);
    } else {
      // Achiever mode: 1 + 2 + 3 + ... + days
      // Formula: (n * (n + 1)) / 2
      setTotal((days * (days + 1)) / 2);
    }
  }, [contribution, days, slots, mode]);

  return (
    <section id="calculator" className="py-24 bg-navy-dark relative overflow-hidden">
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
          
          {/* Mode Switcher */}
          <div className="flex justify-center mt-8">
            <div className="bg-navy-light/50 p-1 rounded-full border border-white/10 flex items-center">
              <button
                onClick={() => setMode("standard")}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  mode === "standard" 
                    ? "bg-primary text-navy-dark shadow-lg" 
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Standard Plans
              </button>
              <button
                onClick={() => setMode("achiever")}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  mode === "achiever" 
                    ? "bg-primary text-navy-dark shadow-lg" 
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Achiever (Increments)
              </button>
            </div>
          </div>
        </div>

        <motion.div 
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto relative group"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-primary via-navy-light to-primary rounded-[2rem] blur-md opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          
          <div className="relative bg-navy-light/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 md:p-12 shadow-2xl">
            <div className="space-y-8">
              <AnimatePresence mode="wait">
                {mode === "standard" ? (
                  <motion.div
                    key="standard-inputs"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
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
                        className="w-full h-2 bg-navy-dark rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>

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
                        className="w-full h-2 bg-navy-dark rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>

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
                        className="w-full h-2 bg-navy-dark rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="achiever-inputs"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
                    <div className="bg-navy-dark/50 p-4 rounded-xl border border-primary/20 text-sm text-gray-300 leading-relaxed">
                      <strong className="text-primary block mb-1">How it works:</strong>
                      You save GH₵1 on Day 1, GH₵2 on Day 2, GH₵3 on Day 3, and so on until the end of your cycle.
                    </div>
                    <div>
                      <label className="flex items-center justify-between text-sm text-gray-300 mb-4">
                        <span className="font-grotesk tracking-wide text-white font-medium">Cycle Duration</span>
                        <span className="font-bold text-primary text-lg">{days} days</span>
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={365}
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className="w-full h-2 bg-navy-dark rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="pt-8 mt-8 border-t border-white/10 relative">
                <div className="absolute left-1/2 -top-3 -translate-x-1/2 bg-navy-dark px-4 py-1 rounded-full border border-white/10 text-[10px] text-gray-400 uppercase tracking-widest">
                  Projection
                </div>
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="text-gray-400 text-sm mb-2 font-medium">Estimated Total Returns</span>
                  <motion.div
                    key={`${total}-${mode}`}
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
                  {mode === "standard" 
                    ? `Formula: ${contribution} (Amt) × ${days} (Days) × ${slots} (Slots)`
                    : `Formula: Sum of 1 to ${days} (Arithmetic Progression)`}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
