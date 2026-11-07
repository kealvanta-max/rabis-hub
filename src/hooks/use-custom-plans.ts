"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CustomPlan } from "@/lib/plans-data";

/**
 * Loads the admin-managed custom plans from `settings/customPlans`.
 * Shared by the landing page, registration form, dashboards and admin tools so
 * every surface shows the same plans.
 */
export function useCustomPlans() {
  const [customPlans, setCustomPlans] = useState<CustomPlan[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    /*
     * Firestore opens a long lived channel and, on a slow phone, competes with
     * the largest paint for bandwidth. These are optional extras on top of the
     * published plans, so they are fetched once the page is idle instead of
     * during load.
     */
    const load = async () => {
      
      try {
        const snap = await getDoc(doc(db, "settings", "customPlans"));
        if (active && snap.exists()) {
          const plans = snap.data()?.plans;
          if (Array.isArray(plans)) setCustomPlans(plans as CustomPlan[]);
        }
      } catch {
        /* Not configured, offline, or blocked. The published plans still show. */
      } finally {
        if (active) setLoaded(true);
      }
    };

    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (typeof idle === "function") {
      const handle = idle(() => void load());
      return () => {
        active = false;
        window.cancelIdleCallback?.(handle);
      };
    }
    timer = setTimeout(() => void load(), 2500);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { customPlans, loaded };
}
