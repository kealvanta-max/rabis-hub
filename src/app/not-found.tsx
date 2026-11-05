import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#020C06] text-white">
      <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4">Error 404</p>
      <h1 className="font-display text-4xl md:text-5xl mb-4">Page not found</h1>
      <p className="text-sm text-gray-400 max-w-md mb-8">
        The page you are looking for has moved or never existed. Head back to the savings hub to continue.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="px-6 py-3 rounded-xl bg-primary text-[#020C06] font-bold hover:brightness-110 transition-all"
        >
          Back to home
        </Link>
        <Link
          href="/guide"
          className="px-6 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-all"
        >
          Read the guide
        </Link>
      </div>
    </main>
  );
}
