"use client";

import { motion } from "framer-motion";
import Navigation from "@/components/layout/navigation";
import Footer from "@/components/layout/footer";

export default function GuidePage() {
  const sections = [
    {
      id: "welcome",
      icon: "👋",
      title: "Welcome to Rabi's Saving Hub",
      content: "Rabi's Saving Hub is a trusted community savings platform (Susu) where members contribute regularly and take turns receiving a lump sum payout. Here's how to get started."
    },
    {
      id: "register",
      icon: "📝",
      title: "How to Register (Step by Step)",
      steps: [
        "Choose your plan on the homepage",
        "Fill in your personal details (name, email, phone, location, password)",
        "Upload your Ghana Card (front and back) and a clear passport photo",
        "Complete the liveness face scan (smile, then blink)",
        "Allow GPS location detection",
        "Solve the math captcha and accept the terms",
        "Submit — your application will be reviewed by the admin"
      ]
    },
    {
      id: "how-it-works",
      icon: "💰",
      title: "How Susu Works",
      content: "All members in your plan contribute the same amount on the agreed schedule (daily, weekly, or monthly). Each round, one member receives the full pool. The order is determined by the admin. Everyone gets a turn."
    },
    {
      id: "track-payments",
      icon: "📊",
      title: "How to Track Your Payments",
      content: "Go to Dashboard > My Payments. You will see your active Susu round. When you make a payment via MoMo to the listed number, click 'I Have Paid' and enter your MoMo reference. The admin will confirm your payment."
    },
    {
      id: "status",
      icon: "✅",
      title: "Understanding Your Status",
      statuses: [
        { status: "Pending", description: "Your application is under review" },
        { status: "Approved", description: "You are a verified member and can join WhatsApp groups" },
        { status: "Rejected", description: "Your application was not approved — contact support" }
      ]
    },
    {
      id: "faq",
      icon: "❓",
      title: "Frequently Asked Questions",
      faqs: [
        { q: "How long does approval take?", a: "Usually within 24-48 hours after submission." },
        { q: "What if I miss a payment?", a: "Contact the admin immediately via WhatsApp." },
        { q: "Can I join multiple plans?", a: "Yes! Go to your dashboard and click 'Join Another Plan.'" },
        { q: "Is my data secure?", a: "Yes. All data is encrypted and stored securely." }
      ]
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <div className="min-h-screen bg-navy-dark">
      <Navigation />
      
      <main className="pt-24 pb-16">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-4">
              How to Use <span className="gold-text-gradient">Rabi&apos;s Saving Hub</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              A complete guide to help you get started with our community savings platform and make the most of your Susu experience.
            </p>
          </motion.div>
        </section>

        {/* Sections */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12"
        >
          {sections.map((section) => (
            <motion.section
              key={section.id}
              variants={itemVariants}
              className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 md:p-12"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="text-4xl">{section.icon}</div>
                <h2 className="font-display text-2xl md:text-3xl text-white">{section.title}</h2>
              </div>

              {/* Regular content */}
              {section.content && (
                <p className="text-gray-300 text-lg leading-relaxed">{section.content}</p>
              )}

              {/* Steps */}
              {section.steps && (
                <div className="space-y-3">
                  {section.steps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-navy-dark flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </div>
                      <p className="text-gray-300 pt-1">{step}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Statuses */}
              {section.statuses && (
                <div className="grid md:grid-cols-3 gap-4">
                  {section.statuses.map((item, idx) => (
                    <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <h3 className="font-bold text-primary mb-2">{item.status}</h3>
                      <p className="text-sm text-gray-400">{item.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* FAQs */}
              {section.faqs && (
                <div className="space-y-4">
                  {section.faqs.map((faq, idx) => (
                    <div key={idx} className="border-l-2 border-primary pl-4">
                      <h3 className="font-bold text-white mb-1">{faq.q}</h3>
                      <p className="text-gray-400">{faq.a}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.section>
          ))}
        </motion.div>

        {/* CTA Section */}
        <motion.section
          variants={itemVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16"
        >
          <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border border-primary/30 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="font-display text-3xl text-white mb-4">Ready to Get Started?</h2>
            <p className="text-gray-300 mb-8 max-w-2xl mx-auto">
              Join thousands of members who are building wealth together through Rabi&apos;s Saving Hub.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/auth?mode=signup"
                className="px-8 py-3 bg-primary text-navy-dark font-bold rounded-xl hover:bg-primary/90 transition-colors"
              >
                Create Account
              </a>
              <a
                href="/#plans"
                className="px-8 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-colors border border-white/20"
              >
                View Plans
              </a>
            </div>
          </div>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}
