"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#020C06] text-white">
      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 003.82 21h16.36a2 2 0 001.71-2.96L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h1 className="font-display text-3xl mb-3">Something went wrong</h1>
      <p className="text-sm text-gray-400 max-w-md mb-8">
        We hit an unexpected error while loading this page. Your savings data is safe — try again, and if the problem
        continues contact support on WhatsApp.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={reset}
          className="px-6 py-3 rounded-xl bg-primary text-[#020C06] font-bold hover:brightness-110 transition-all cursor-pointer"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-6 py-3 rounded-xl border border-white/15 text-white font-semibold hover:bg-white/5 transition-all"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
