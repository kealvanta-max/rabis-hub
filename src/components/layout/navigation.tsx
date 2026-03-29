"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import LanguageSwitcher from "@/components/layout/language-switcher";

export default function Navigation() {
  const { user, isAdmin, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[9000] transition-all duration-300 ${
        scrolled
          ? "bg-navy-dark/95 backdrop-blur-md shadow-lg shadow-black/20 border-b border-white/5"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group" onClick={() => setMenuOpen(false)}>
            <img 
              src="/brand_logo.png" 
              alt="Rabi's Saving Hub Logo" 
              className="h-10 w-auto object-contain group-hover:scale-105 transition-transform drop-shadow-md"
            />
            <span className="font-display text-lg sm:text-xl gold-text-gradient font-bold tracking-tight">
              Rabi&apos;s Saving Hub
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink href="/#plans">Plans</NavLink>
            <NavLink href="/#calculator">Calculator</NavLink>
            <NavLink href="/#testimonials">Reviews</NavLink>
            <NavLink href="/#contact">Contact</NavLink>

            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Dashboard
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="px-4 py-2 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    Admin
                  </Link>
                )}
                <button
                  onClick={logout}
                  className="ml-2 px-4 py-2 text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth?mode=signin"
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth?mode=signup"
                  className="ml-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-gold-accent text-navy-dark hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                >
                  Join Now
                </Link>
              </>
            )}

            <LanguageSwitcher />
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-gray-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Toggle menu"
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
        <div className="md:hidden bg-navy-dark/98 backdrop-blur-md border-t border-white/5">
          <div className="px-4 py-4 space-y-1">
            <MobileLink href="/#plans" onClick={() => setMenuOpen(false)}>Plans</MobileLink>
            <MobileLink href="/#calculator" onClick={() => setMenuOpen(false)}>Calculator</MobileLink>
            <MobileLink href="/#testimonials" onClick={() => setMenuOpen(false)}>Reviews</MobileLink>
            <MobileLink href="/#contact" onClick={() => setMenuOpen(false)}>Contact</MobileLink>

            {user ? (
              <>
                <MobileLink href="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</MobileLink>
                {isAdmin && (
                  <MobileLink href="/admin" onClick={() => setMenuOpen(false)}>Admin Panel</MobileLink>
                )}
                <button
                  onClick={() => { logout(); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="pt-3 flex gap-3">
                <Link
                  href="/auth?mode=signin"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 text-center px-4 py-3 text-sm border border-gray-700 text-gray-300 rounded-xl hover:bg-white/5 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth?mode=signup"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 text-center px-4 py-3 text-sm font-semibold bg-gradient-to-r from-primary to-gold-accent text-navy-dark rounded-xl"
                >
                  Join Now
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
    >
      {children}
    </Link>
  );
}

function MobileLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
    >
      {children}
    </Link>
  );
}
