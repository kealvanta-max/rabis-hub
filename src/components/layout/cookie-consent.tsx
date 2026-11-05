"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";
import { getConsent, setConsent, type ConsentValue } from "@/lib/consent";

/**
 * Cookie consent — GDPR-style, honest about what is collected, and it never
 * blocks the page. Analytics only loads after "Accept all".
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent()) return;
    const timer = setTimeout(() => setVisible(true), 1400);
    return () => clearTimeout(timer);
  }, []);

  const choose = (value: ConsentValue) => {
    setConsent(value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-24 z-[9990] md:inset-x-auto md:right-6 md:bottom-6 md:max-w-sm"
    >
      <div className="glass glass-sheen rounded-3xl p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-emerald-400/15 p-2 text-emerald-300">
            <Cookie className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">We use cookies</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Essential cookies keep you signed in. With your permission we also measure how the site is used so we
              can improve it. Read our{" "}
              <Link href="/privacy" className="text-emerald-300 underline underline-offset-2">
                privacy policy
              </Link>
              .
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => choose("essential-only")}
            className="rounded-full p-1 text-gray-500 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => choose("essential-only")}
            className="flex-1 rounded-xl border border-white/12 px-3 py-2.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-3 py-2.5 text-xs font-bold text-[#04150c] transition-transform active:scale-[0.98]"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
