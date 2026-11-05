import { HelpCircle, ChevronDown } from "lucide-react";
import { FAQS, FAQ_JSON_LD } from "@/lib/site";

/**
 * Real member questions, answered on-page and marked up for Google.
 * Server component: zero client JS, and the content is in the initial HTML
 * where crawlers and slow connections can both reach it.
 */
export default function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="relative px-4 py-20 sm:py-28">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
            <HelpCircle className="h-3.5 w-3.5" />
            Questions
          </span>
          <h2 id="faq-heading" className="font-display mt-5 text-3xl text-white sm:text-4xl">
            Everything members ask <span className="gold-text-gradient">before joining</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-400">
            Still unsure? Message Rabi directly on WhatsApp, a real person answers.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group glass-soft overflow-hidden rounded-2xl px-5 py-4 transition-colors hover:border-emerald-400/25"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                <span className="text-sm font-semibold text-white sm:text-base">{item.q}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-emerald-300 transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-gray-400">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
