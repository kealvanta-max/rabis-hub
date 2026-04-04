"use client";

import Card from "@/components/ui/card";
import { motion } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};

export default function ContactSection() {
  return (
    <section id="contact" className="py-24 bg-navy-light/30 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-primary text-sm font-semibold tracking-widest uppercase mb-3 font-grotesk"
          >
            Get in Touch
          </motion.p>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-6"
          >
            Let&apos;s <span className="gold-text-gradient">Connect</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-gray-400 max-w-xl mx-auto text-lg"
          >
            Have questions about our digital Susu plans? We&apos;re here to guide you every step of the way.
          </motion.p>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto"
        >
          <motion.div variants={itemVariants} className="h-full">
            <Card hover className="h-full text-center flex flex-col items-center justify-center p-8 bg-navy-dark/50 backdrop-blur-sm border-white/5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-6 shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white mb-2">Direct Line</h3>
              <a href="tel:+233504701032" className="text-sm text-gray-400 hover:text-primary transition-colors">
                +233 50 470 1032
              </a>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="h-full">
            <Card hover className="h-full text-center flex flex-col items-center justify-center p-8 bg-navy-dark/50 backdrop-blur-sm border-white/5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-[#25D366]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10 inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366]/10 text-[#25D366] mb-6 shadow-[0_0_15px_rgba(37,211,102,0.2)]">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <h3 className="relative z-10 text-base font-bold text-white mb-2">WhatsApp</h3>
              <a
                href="https://wa.me/233504701032"
                target="_blank"
                rel="noopener noreferrer"
                className="relative z-10 text-sm text-gray-400 hover:text-[#25D366] transition-colors"
              >
                Chat Instantly
              </a>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="h-full">
            <Card hover className="h-full text-center flex flex-col items-center justify-center p-8 bg-navy-dark/50 backdrop-blur-sm border-white/5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-500/10 text-blue-400 mb-6 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white mb-2">Email Us</h3>
              <a href="mailto:rabisavinghub@gmail.com" className="text-sm text-gray-400 hover:text-blue-400 transition-colors">
                rabisavinghub@gmail.com
              </a>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="h-full">
            <Card hover className="h-full text-center flex flex-col items-center justify-center p-8 bg-navy-dark/50 backdrop-blur-sm border-white/5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 text-red-400 mb-6 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white mb-2">Headquarters</h3>
              <p className="text-sm text-gray-400">Accra, Ghana</p>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

