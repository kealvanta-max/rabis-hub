import Link from "next/link";
import { ShieldCheck, MessageCircle, Wallet, BadgeCheck } from "lucide-react";

import { SITE } from "@/lib/site";

/**
 * Who you are actually giving your money to.
 *
 * The landing page used to answer that question with three numbers: "2K+
 * members", "GH₵5M+ saved", "98% success rate". None of them were real, and a
 * visitor deciding whether to trust a stranger with GH₵6 a day does not read
 * numbers like that as reassurance. They read them as a sales page.
 *
 * What a Susu member actually checks is the same three things they would check
 * about a collector in their own market: who the person is, how the money moves,
 * and what happens when something goes wrong. This section answers those, in
 * Rabi's own words, with her WhatsApp number one tap away.
 *
 * A server component with no JavaScript: the whole point is that it is in the
 * initial HTML, so it is readable on a 2G connection and indexable as text.
 */

const STEPS = [
  {
    icon: Wallet,
    title: "A plan you can actually afford",
    body: "Daily, weekly, six month, monthly and Achiever rounds. The smallest is GH₵6 a day, which is the number most members start on.",
  },
  {
    icon: MessageCircle,
    title: "Your group, on WhatsApp",
    body: "Rabi posts the round, confirms each contribution in the group, and names the pay out date. Nothing is agreed in a place you cannot read back.",
  },
  {
    icon: BadgeCheck,
    title: "Your record, not a book",
    body: "Contributions are recorded against your account, so the payout history belongs to you and not to a card that can be lost.",
  },
  {
    icon: ShieldCheck,
    title: "When something goes wrong",
    body: "A late week is discussed in the group, the way a collector and a member would. Nobody is silently cut off.",
  },
];

export default function RabiSection() {
  return (
    <section
      id="rabi"
      aria-labelledby="rabi-heading"
      className="relative overflow-hidden px-4 py-20 sm:py-28"
    >
      {/*
        A single soft wash. The page had four full width blurred circles of
        primary green behind it; on a mid range phone each one is an expensive
        paint and together they read as template decoration.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/[0.06] to-transparent"
      />

      <div className="relative mx-auto max-w-5xl">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] md:items-start md:gap-14">
          {/*
            The portrait slot.

            There is no photograph of Rabi in this repository, and the honest
            thing to do is say so in code rather than ship a stock face or a
            generated one. A member is being asked to trust a specific person;
            that person's own face is the only image that answers it.

            Drop `rabi.webp` (roughly 4:5, under 60 KB) into `public/images/`
            and this becomes a photo by swapping the placeholder block below for
            a next/image. Until then it is a name, a role and an initial, which
            is truthful and still puts a human in the first screenful.
          */}
          <div className="relative">
            <div className="glass-soft relative rounded-3xl p-6">
              <div className="relative mx-auto grid aspect-[4/5] w-full max-w-[260px] place-items-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-primary/[0.12] to-transparent">
                <span className="font-display text-6xl text-primary" aria-hidden="true">
                  R
                </span>
              </div>
              <p className="mt-4 text-center font-display text-xl text-white">Rabi</p>
              <p className="text-center text-sm text-gray-300">
                Collector and founder, Accra
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Who you are saving with
            </p>
            <h2
              id="rabi-heading"
              className="mt-3 font-display text-3xl text-white sm:text-4xl"
            >
              Rabi runs the susu. The software just writes it down.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-200">
              This is not a fund and there is no company standing between you and
              her. It is the susu you already know, with the book replaced by a
              record you can open yourself. Rabi collects the contributions, holds
              the round, and pays out. If that is not the arrangement you want, it
              is better to know now than after your first payment.
            </p>

            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="flex gap-3">
                    <Icon
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    />
                    <div>
                      <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-gray-300">
                        {step.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
                  "Hello Rabi, I want to ask about the savings plans before I join."
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-navy-dark transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#020C06]"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Ask Rabi before you join
              </a>
              <Link
                href="/auth?mode=signup"
                prefetch={false}
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#020C06]"
              >
                Start with GH₵6
              </Link>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-gray-300">
              Her number is {SITE.phone}. It is a real line and she answers it
              herself, usually the same day.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
