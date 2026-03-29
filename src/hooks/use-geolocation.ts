"use client";

import { useState, useCallback } from "react";
import { detectGps, type GpsResult } from "@/lib/geolocation";

export type GpsStatus = "idle" | "detecting" | "success" | "denied" | "error";

export function useGeolocation() {
  const [status, setStatus] = useState<GpsStatus>("idle");
  const [gpsData, setGpsData] = useState<GpsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(async () => {
    setStatus("detecting");
    setError(null);

    try {
      const result = await detectGps();
      setGpsData(result);
      setStatus("success");
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg === "PERMISSION_DENIED") {
        setStatus("denied");
        setError("Location access was denied. This is required to continue registration.");
      } else {
        setStatus("error");
        setError(msg);
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setGpsData(null);
    setError(null);
  }, []);

  return { status, gpsData, error, requestLocation, reset };
}
