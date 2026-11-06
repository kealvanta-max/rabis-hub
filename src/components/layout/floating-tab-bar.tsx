"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Home, LayoutDashboard, BookOpen, ShieldCheck, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

const ROUTES_WITHOUT_DOCK = ["/auth", "/terms", "/privacy"];

/** Rabi's WhatsApp line — the only "payments desk" this MVP needs. */
const WHATSAPP_NUMBER = "233504701032";

/**
 * Floating liquid-glass tab bar (iOS style).
 *
 * Mobile only — desktop keeps the header navigation. It renders nothing on the
 * signup flow so the 5-step registration keeps the user's full attention.
 */
export default function FloatingTabBar() {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();
  const reducedMotion = useReducedMotion();

  if (ROUTES_WITHOUT_DOCK.some((route) => pathname?.startsWith(route))) return null;

  /*
   * The owner has no member record, so the Hub tab is a dead end for her: it
   * either bounces to /admin or shows an empty shell. Admins get Admin in its
   * place instead, which is the only screen they came for.
   */
  const items = [
    { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
    ...(isAdmin
      ? []
      : [
          {
            href: user ? "/dashboard" : "/auth?mode=signin",
            label: "Hub",
            icon: LayoutDashboard,
            match: (p: string) => p.startsWith("/dashboard"),
          },
        ]),
    {
      href: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hello Rabi! I need help with my savings.")}`,
      label: "Chat",
      icon: MessageCircle,
      external: true,
      match: () => false,
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
        <div className="lg-surface mx-auto flex max-w-[430px] items-center justify-around gap-1 rounded-[26px] p-1.5">
          {items.map((item) => {
            const active = item.match(pathname ?? "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={cn(
                  "relative flex min-w-[58px] flex-col items-center gap-1 rounded-[20px] px-2 py-2 text-[10px] font-semibold",
                  active ? "text-emerald-300" : "text-gray-400 hover:text-gray-100"
                )}
              >
                {/* The travelling bubble: one shared layoutId so the highlight
                    slides between tabs with heavy-liquid inertia. */}
                {active && (
                  <motion.span
                    layoutId="dock-bubble"
                    aria-hidden="true"
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { type: "spring", mass: 0.5, damping: 15, stiffness: 100 }
                    }
                    className="lg-pill absolute inset-0 rounded-[20px] bg-emerald-400/15"
                  />
                )}
                <Icon
                  className={cn("relative z-10 h-5 w-5", active && "scale-110")}
                  strokeWidth={active ? 2.4 : 1.9}
                />
                <span className="relative z-10 tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
