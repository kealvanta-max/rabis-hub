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
    <section id="plans" className="py-24 bg-navy-dark relative">
       {/* Section Header */}
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
        <motion.p 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-primary text-sm font-semibold tracking-widest uppercase mb-3 font-grotesk"
        >
          Curated Journeys
        </motion.p>
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-6"
        >
          Choose Your <span className="gold-text-gradient">Saving Path</span>
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-gray-400 max-w-2xl text-lg"
        >
          Flexible digital Susu plans designed for every stage of your financial growth. Start small, scale fast.
        </motion.p>
      </div>

      {/* Removed Carousel to ensure all 5 plans are immediately visible and not hidden off-screen */}
      <CarouselContext.Provider value={{ onCardClose: () => {}, currentIndex: -1 }}>
        <div className="max-w-7xl mx-auto px-4 mt-8">
          <div className="flex flex-wrap justify-center gap-6">
            {cards}
          </div>
        </div>
      </CarouselContext.Provider>

      {/* Final CTA */}
      <div className="max-w-7xl mx-auto px-4 text-center mt-12">
          <Link
            href="/auth?mode=signup"
            className="group inline-flex items-center gap-3 px-10 py-4 text-lg font-bold rounded-full bg-primary text-navy-dark hover:scale-105 transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)]"
          >
            Start Your Plan
            <MoveRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
      </div>
    </section>
  );
}

const PlanList = ({ plans, category }: { plans: any[]; category: string }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {plans.map((plan) => (
        <div 
          key={plan.id} 
          className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/50 transition-colors group"
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs text-primary uppercase font-bold tracking-tighter">{category}</span>
            {plan.slots && <span className="text-[10px] text-gray-500">{plan.slots} Slots Left</span>}
          </div>
          <p className="text-2xl font-bold text-white mb-1">GH₵{plan.amt} <span className="text-sm font-normal text-gray-500">/ {plan.freq}</span></p>
          <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
             <span className="text-xs text-gray-500 font-medium">Estimated Return</span>
             <span className="text-xl font-bold text-emerald-400">₵{plan.ret.toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const AchieverList = ({ tiers }: { tiers: any[] }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {tiers.map((tier) => (
        <div 
          key={tier.days} 
          className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/50 transition-colors"
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs text-primary uppercase font-bold tracking-tighter">Achiever</span>
            <span className="text-[10px] text-gray-500">{tier.days} Days</span>
          </div>
          <p className="text-xl font-bold text-white mb-1">₵1 Daily Increment</p>
          <p className="text-[10px] text-gray-500 mb-6 italic">Day 1 = ₵1 ... Day {tier.days} = ₵{tier.days}</p>
          <div className="flex justify-between items-center mt-auto pt-4 border-t border-white/5">
             <span className="text-xs text-gray-500 font-medium">Total Return</span>
             <span className="text-xl font-bold text-emerald-400">₵{tier.ret.toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

