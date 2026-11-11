"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useTranslation } from "@/context/i18n-context";
import LanguageSwitcher from "@/components/layout/language-switcher";
import LiquidGlassNav from "@/components/ui/liquid-glass-nav";

export default function Navigation() {
  const { user, isAdmin, logout } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const primaryItems = useMemo(
    () => [
      { href: "/#plans", label: t.nav_plans },
      { href: "/#calculator", label: t.nav_calculator },
      { href: "/#testimonials", label: t.nav_reviews },
      { href: "/guide", label: "Guide" },
      { href: "/#contact", label: t.nav_contact },
    ],
    [t.nav_plans, t.nav_calculator, t.nav_reviews, t.nav_contact]
  );

  /** Only real routes can be "current" — hash anchors are not pages. */
  const activeHref = primaryItems.some((item) => item.href === pathname) ? pathname ?? undefined : undefined;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    /*
     * This is a <header>, not a <nav>.
     *
     * It wraps the wordmark, the section links, the account actions and the
     * language picker, and inside it sits LiquidGlassNav, which is itself a
     * <nav>. A <nav> inside a <nav> gives a screen reader two navigation
     * landmarks with nothing to distinguish them, which is a landmark violation
     * and the reason a jump list here reads "navigation, navigation".
     *
     * <header> is the correct element for the site banner anyway, and it keeps
     * exactly one navigation landmark on the page.
     */
    <header
      className={`fixed top-0 left-0 right-0 z-[9000] transition-[background-color,box-shadow] duration-500 ${
        scrolled ? "lg-surface" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group" onClick={() => setMenuOpen(false)}>
            <Image 
              src="/brand-logo.webp" 
              alt="Rabi's Saving Hub Logo" 
              width={160}
              height={40}
              priority
              className="h-10 w-auto object-contain group-hover:scale-105 transition-transform drop-shadow-md"
            />
            <span className="font-display text-lg sm:text-xl gold-text-gradient font-bold tracking-tight">
              Rabi&apos;s Saving Hub
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-2">
            <LiquidGlassNav items={primaryItems} activeHref={activeHref} ariaLabel="Main navigation" />

            {user ? (
              <>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className="px-4 py-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    Admin Panel
                  </Link>
                ) : (
                  <Link
                    href="/dashboard"
                    className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    {t.nav_dashboard}
                  </Link>
                )}
                <button
                  onClick={logout}
                  className="ml-2 px-4 py-2 text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  {t.nav_logout}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth?mode=signin"
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  {t.nav_signin}
                </Link>
                <Link
                  href="/auth?mode=signup"
                  className="ml-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-gold-accent text-navy-dark hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                >
                  {t.nav_join}
                </Link>
              </>
            )}

            <LanguageSwitcher />
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-gray-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div id="mobile-menu" className="lg-surface md:hidden rounded-b-3xl">
          <div className="px-4 py-4 space-y-1">
            <MobileLink href="/#plans" onClick={() => setMenuOpen(false)}>{t.nav_plans}</MobileLink>
            <MobileLink href="/#calculator" onClick={() => setMenuOpen(false)}>{t.nav_calculator}</MobileLink>
            <MobileLink href="/#testimonials" onClick={() => setMenuOpen(false)}>{t.nav_reviews}</MobileLink>
            <MobileLink href="/guide" onClick={() => setMenuOpen(false)}>Guide</MobileLink>
            <MobileLink href="/#contact" onClick={() => setMenuOpen(false)}>{t.nav_contact}</MobileLink>

            {user ? (
              <>
                <div className="px-4 py-2 flex justify-start">
                  <LanguageSwitcher />
                </div>
                {isAdmin ? (
                  <MobileLink href="/admin" onClick={() => setMenuOpen(false)}>Admin Panel</MobileLink>
                ) : (
                  <MobileLink href="/dashboard" onClick={() => setMenuOpen(false)}>{t.nav_dashboard}</MobileLink>
                )}
                <button
                  onClick={() => { logout(); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                >
                  {t.nav_logout}
                </button>
              </>
            ) : (
              <>
                <div className="px-4 py-2 flex justify-start">
                  <LanguageSwitcher />
                </div>
                <div className="pt-3 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/auth?mode=signin"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 text-center px-4 py-3 text-sm border border-gray-700 text-gray-300 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    {t.nav_signin}
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 text-center px-4 py-3 text-sm font-semibold bg-gradient-to-r from-primary to-gold-accent text-navy-dark rounded-xl"
                  >
                    {t.nav_join}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function MobileLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors whitespace-normal break-words"
    >
      {children}
    </Link>
  );
}
