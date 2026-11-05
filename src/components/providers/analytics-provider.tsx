"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initAnalytics, track } from "@/lib/analytics";
import { analyticsAllowed, onConsentChange } from "@/lib/consent";
import { installGlobalErrorHandlers } from "@/lib/monitoring";

/**
 * One mount point for behavioural analytics + error reporting.
 * Both stay dormant until the visitor consents / the DSN exists.
 */
export default function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    const uninstall = installGlobalErrorHandlers();
    if (analyticsAllowed()) void initAnalytics();

    const unsubscribe = onConsentChange((value) => {
      if (value === "granted") void initAnalytics();
    });

    return () => {
      uninstall();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!pathname || !analyticsAllowed()) return;
    track("$pageview", { path: pathname, url: window.location.href });
  }, [pathname]);

  return null;
}
