"use client";
import { useMemo } from "react";
import { useTranslation } from "@/context/i18n-context";

import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { 
  ShieldCheck, 
  Users, 
  TrendingUp, 
  Smartphone,
  ArrowUpRight,
  Fingerprint,
  Wallet,
  Globe
} from "lucide-react";
import { motion } from "framer-motion";

export default function TrustSection() {
  const { t } = useTranslation();
  const features = useMemo(() => [
    {
      title: t.trust_security_title,
      description: t.trust_security_desc,
      header: <SkeletonOne />,
      className: "md:col-span-2",
      icon: <ShieldCheck className="h-4 w-4 text-primary" />,
    },
    {
      title: t.trust_community_title,
      description: t.trust_community_desc,
      header: <SkeletonTwo />,
      className: "md:col-span-1",
      icon: <Users className="h-4 w-4 text-primary" />,
    },
    {
      title: t.trust_returns_title,
      description: t.trust_returns_desc,
      header: <SkeletonThree />,
      className: "md:col-span-1",
      icon: <TrendingUp className="h-4 w-4 text-primary" />,
    },
    {
      title: t.trust_mobile_title,
      description: t.trust_mobile_desc,
      header: <SkeletonFour />,
      className: "md:col-span-2",
      icon: <Smartphone className="h-4 w-4 text-primary" />,
    },
  ], [t]);


  return (
    <section className="py-24 bg-navy-dark relative overflow-hidden">
      {/* Decorative background circle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-primary text-sm font-semibold tracking-widest uppercase mb-3 font-grotesk"
          >
            {t.trust_label}
          </motion.p>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-6"
          >
            {t.trust_heading} <span className="gold-text-gradient">{t.trust_heading_gold}</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-gray-400 max-w-2xl mx-auto text-lg"
          >
            {t.trust_description}
          </motion.p>
        </div>

        <BentoGrid className="max-w-5xl mx-auto">
          {features.map((item, i) => (
            <BentoGridItem
              key={i}
              title={item.title}
              description={item.description}
              header={item.header}
              className={item.className}
              icon={item.icon}
            />
          ))}
        </BentoGrid>
      </div>
    </section>
  );
}

const SkeletonOne = () => (
  <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-2xl bg-dot-white/[0.2] [mask-image:radial-gradient(ellipse_at_center,white,transparent)] border border-white/[0.1] bg-navy-light/50 flex-col items-center justify-center space-y-2">
    <Fingerprint className="h-10 w-10 text-primary animate-pulse" />
    <div className="flex gap-2">
      <div className="w-8 h-1 bg-primary/20 rounded-full" />
      <div className="w-12 h-1 bg-primary rounded-full" />
      <div className="w-6 h-1 bg-primary/20 rounded-full" />
    </div>
  </div>
);

const SkeletonTwo = () => (
  <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-2xl bg-navy-light/50 border border-white/[0.1] p-4 flex-col items-center justify-center overflow-hidden">
    <div className="flex -space-x-3 mb-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="w-10 h-10 rounded-full border-2 border-navy-dark bg-gray-800 flex items-center justify-center text-[10px] text-white overflow-hidden">
           <div className="w-full h-full bg-gradient-to-br from-primary/40 to-navy-light" />
        </div>
      ))}
      <div className="w-10 h-10 rounded-full border-2 border-navy-dark bg-primary flex items-center justify-center text-[10px] text-navy-dark font-bold">
        +2k
      </div>
    </div>
    <div className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-[10px] items-center flex gap-1">
      <span className="w-1 h-1 rounded-full bg-green-500 animate-ping" />
      Live WhatsApp Group
    </div>
  </div>
);

const SkeletonThree = () => (
  <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-2xl bg-navy-light/50 border border-white/[0.1] p-4 flex-col justify-end">
    <div className="flex items-baseline gap-1 mb-2">
      <span className="text-2xl font-bold text-white">₵2,450</span>
      <span className="text-[10px] text-primary">+12.5%</span>
    </div>
    <div className="w-full h-12 flex items-end gap-1">
      {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
        <div 
          key={i} 
          className="flex-1 bg-primary/20 rounded-t-sm group-hover:bg-primary/40 transition-colors"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  </div>
);

const SkeletonFour = () => (
  <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-2xl bg-navy-light/50 border border-white/[0.1] p-4 relative overflow-hidden group">
    <div className="absolute top-4 right-4 text-primary opacity-20 group-hover:opacity-100 transition-opacity">
      <ArrowUpRight className="h-6 w-6" />
    </div>
    <div className="flex items-center gap-4 h-full">
      <div className="w-16 h-28 border border-white/20 rounded-md bg-navy-dark p-1">
         <div className="w-full h-full bg-white/5 rounded-sm flex flex-col gap-1 p-1">
            <div className="w-full h-2 bg-primary/20 rounded-full" />
            <div className="w-2/3 h-1 bg-white/10 rounded-full" />
            <div className="mt-auto w-full h-4 bg-primary/10 rounded-sm" />
         </div>
      </div>
      <div className="flex-1 flex flex-col gap-2">
         <div className="w-full h-4 bg-white/5 rounded-md" />
         <div className="w-3/4 h-2 bg-white/5 rounded-full" />
         <div className="w-1/2 h-2 bg-white/5 rounded-full" />
      </div>
    </div>
  </div>
);

