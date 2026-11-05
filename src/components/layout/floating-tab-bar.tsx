"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutDashboard, Wallet, BookOpen, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

const ROUTES_WITHOUT_DOCK = ["/auth", "/terms", "/privacy"];

/**
 * Floating liquid-glass tab bar (iOS style).
 *
 * Mobile only — desktop keeps the header navigation. It renders nothing on the
 * signup flow so the 5-step registration keeps the user's full attention.
 */
export default function FloatingTabBar() {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();

  if (ROUTES_WITHOUT_DOCK.some((route) => pathname?.startsWith(route))) return null;

  const items = [
    { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
    {
      href: user ? "/dashboard" : "/auth?mode=signin",
      label: "Hub",
      icon: LayoutDashboard,
      match: (p: string) => p.startsWith("/dashboard") && !p.startsWith("/dashboard/payments"),
    },
    {
      href: "/dashboard/payments",
      label: "Pay",
      icon: Wallet,
      match: (p: string) => p.startsWith("/dashboard/payments"),
    },
    { href: "/guide", label: "Guide", icon: BookOpen, match: (p: string) => p.startsWith("/guide") },
  ];

  if (isAdmin) {
    items.push({
      href: "/admin",
      label: "Admin",
      icon: ShieldCheck,
      match: (p: string) => p.startsWith("/admin"),
    });
  }

  return (
    <>
      {/* Spacer so page content is never hidden behind the dock. */}
      <div className="h-24 md:hidden" aria-hidden="true" />

      <nav
        aria-label="Primary"
        className="pb-safe fixed inset-x-0 bottom-0 z-[9995] px-3 md:hidden"
      >
        <div className="glass glass-sheen mx-auto flex max-w-[430px] items-center justify-around gap-1 rounded-[26px] p-1.5">
          {items.map((item) => {
            const active = item.match(pathname ?? "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-[58px] flex-col items-center gap-1 rounded-[20px] px-2 py-2 text-[10px] font-semibold transition-all duration-300",
                  active
                    ? "bg-emerald-400/15 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                    : "text-gray-400 hover:text-gray-100"
                )}
              >
                {active && (
                  <span className="absolute inset-x-3 -top-px h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
                )}
                <Icon
                  className={cn("h-5 w-5 transition-transform duration-300", active && "scale-110")}
                  strokeWidth={active ? 2.4 : 1.9}
                />
                <span className="tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
