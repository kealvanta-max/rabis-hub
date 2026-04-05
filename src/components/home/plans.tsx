"use client";

import React from "react";
import { Carousel, Card, CarouselContext } from "@/components/ui/apple-cards-carousel";
import { plans, achieverTiers, categoryImages } from "@/lib/plans-data";
import { motion } from "framer-motion";
import Link from "next/link";
import { MoveRight } from "lucide-react";

export default function PlansSection() {
  const cards = [
    {
      category: "Daily Starter",
      title: "Daily Savings Plans",
      src: categoryImages.daily,
      content: <PlanList plans={plans.daily} category="Daily" />,
    },
    {
      category: "Steady Grower",
      title: "Weekly Savings Plans",
      src: categoryImages.weekly,
      content: <PlanList plans={plans.weekly} category="Weekly" />,
    },
    {
      category: "Big Dreamer",
      title: "6-Month Savings Plans",
      src: categoryImages.months,
      content: <PlanList plans={plans.months} category="6 Months" />,
    },
    {
      category: "High Achiever",
      title: "Incremental Savings",
      src: categoryImages.achiever,
      content: <AchieverList tiers={achieverTiers} />,
    },
    {
      category: "Long Term",
      title: "Monthly Savings Plans",
      src: categoryImages.longterm,
      content: <PlanList plans={plans.longterm} category="Monthly" />,
    },
  ].map((card, index) => (
    <Card key={card.src} card={card} index={index} />
  ));

  return (
    <section id="plans" className="py-28 bg-shader-gradient relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gold/10 blur-[120px] rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      {/* Section Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-20 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
          <div className="max-w-2xl">
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="text-primary text-xs font-black tracking-[0.3em] uppercase mb-5 flex items-center gap-4"
            >
              <span className="w-12 h-[1px] bg-primary/50"></span>
              CURATED SAVINGS JOURNEYS
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="font-display text-5xl md:text-6xl lg:text-7xl text-white mb-8 leading-[1.1] tracking-tight"
            >
              Master Your <br />
              <span className="gold-text-gradient italic">Financial Path</span>
            </motion.h2>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="md:max-w-xs pb-2"
          >
            <p className="text-gray-400 text-lg leading-relaxed border-l-2 border-primary/20 pl-6">
              Flexible digital Susu plans engineered for every stage of your growth. Start small, reach higher.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Cards Grid */}
      <CarouselContext.Provider value={{ onCardClose: () => { }, currentIndex: -1 }}>
        <div className="max-w-full mx-auto px-4 relative z-10">
          <div className="flex flex-wrap justify-center gap-10 lg:gap-14">
            {cards}
          </div>
        </div>
      </CarouselContext.Provider>

      {/* Final CTA Overlay */}
      <div className="max-w-7xl mx-auto px-4 text-center mt-24 relative z-10">
        <div className="inline-block p-[1px] rounded-full bg-gradient-to-r from-transparent via-primary/50 to-transparent">
          <Link
            href="/auth?mode=signup"
            className="group relative inline-flex items-center gap-4 px-14 py-6 text-xl font-bold rounded-full bg-navy-dark text-white border border-white/5 hover:border-primary/50 transition-all duration-500 overflow-hidden"
          >
            <span className="relative z-10 gold-text-gradient">Start Your Saving Plan</span>
            <MoveRight className="w-6 h-6 group-hover:translate-x-3 transition-transform text-primary relative z-10" />
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </Link>
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="mt-8 text-gray-500 text-sm font-medium tracking-wide uppercase"
        >
          JOIN 2,000+ GHANAIANS BUILDING WEALTH DAILY
        </motion.p>
      </div>
    </section>
  );
}

const PlanList = ({ plans, category }: { plans: any[]; category: string }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className="group relative p-8 rounded-[2.5rem] bg-navy-dark/40 backdrop-blur-xl border border-white/5 hover:border-primary/20 transition-all duration-700 overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[50px] rounded-full -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="flex justify-between items-start mb-10">
            <div className="space-y-1">
              <span className="text-[10px] text-primary/60 font-black uppercase tracking-[0.2em]">{category}</span>
              <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors">{plan.name.replace(category, '').trim()}</h3>
            </div>
            {plan.slots && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/5 border border-emerald-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">{plan.slots} LEFT</span>
              </div>
            )}
          </div>

          <div className="mb-10">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold font-display text-white italic">₵{plan.amt}</span>
              <span className="text-gray-500 text-sm font-medium">/ {plan.freq === '5 Days' ? 'daily' : plan.freq.toLowerCase()}</span>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex items-center justify-between">
            <div>
              <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">Estimated Net</p>
              <p className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500">
                ₵{plan.ret.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-primary transition-all duration-500">
              <MoveRight className="w-5 h-5 text-gray-400 group-hover:text-navy-dark transition-colors" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const AchieverList = ({ tiers }: { tiers: any[] }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-2">
      {tiers.map((tier) => (
        <div
          key={tier.days}
          className="group relative p-8 rounded-[2.5rem] bg-navy-dark/40 backdrop-blur-xl border border-white/5 hover:border-gold-accent/20 transition-all duration-700 overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gold-accent/5 blur-[50px] rounded-full -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="flex justify-between items-start mb-10">
            <div className="space-y-1">
              <span className="text-[10px] text-gold-accent/60 font-black uppercase tracking-[0.2em]">HIGH ACHIEVER</span>
              <h3 className="text-xl font-bold text-white group-hover:text-gold-accent transition-colors">{tier.days} Days</h3>
            </div>
            <div className="w-2 h-2 rounded-full bg-gold-accent shadow-[0_0_10px_#FACC15]" />
          </div>

          <p className="text-lg font-medium text-gray-300 leading-snug mb-10">
            ₵1 Daily Increment. <br />
            <span className="text-sm text-gray-500 italic leading-relaxed">Start at ₵1, scale to ₵{tier.days}.</span>
          </p>

          <div className="pt-8 border-t border-white/5 flex items-center justify-between">
            <div>
              <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1">Final Bonus</p>
              <p className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-gold-accent to-yellow-600">
                ₵{tier.ret.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-gold-accent transition-all duration-500">
              <MoveRight className="w-5 h-5 text-gray-400 group-hover:text-navy-dark transition-colors" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

