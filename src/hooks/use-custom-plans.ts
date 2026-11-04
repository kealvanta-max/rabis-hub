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

    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "customPlans"));
        if (active && snap.exists()) {
          const plans = snap.data()?.plans;
          if (Array.isArray(plans)) setCustomPlans(plans as CustomPlan[]);
        }
      } catch (error) {
        console.error("Unable to load custom plans:", error);
      } finally {
        if (active) setLoaded(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { customPlans, loaded };
}
