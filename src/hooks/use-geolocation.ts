"use client";

import { useCallback, useState } from "react";
import { detectGps, describeGpsFailure, GpsError, type GpsFailureCode, type GpsResult } from "@/lib/geolocation";

/**
 * "denied" and "unavailable" are both soft failures now. Neither one blocks the
 * member, so neither one is called "error" any more.
 */
export type GpsStatus = "idle" | "detecting" | "success" | "denied" | "unavailable";

export function useGeolocation() {
  const [status, setStatus] = useState<GpsStatus>("idle");
  const [gpsData, setGpsData] = useState<GpsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failureCode, setFailureCode] = useState<GpsFailureCode | null>(null);
  const [attempts, setAttempts] = useState(0);

  const requestLocation = useCallback(async () => {
    setStatus("detecting");
    setError(null);
    setFailureCode(null);

    try {
      const result = await detectGps();
      setGpsData(result);
      setStatus("success");
      /*
       * A pin outside Ghana is kept, not hidden. Rabi sees the flag and can ask
       * about it, which is better than pretending the member has no location.
       */
      setError(result.suspicious ? result.reason ?? null : null);
      return result;
    } catch (err) {
      // Count only completed failures, not attempts still in progress.
      setAttempts((count) => count + 1);
      const code: GpsFailureCode = err instanceof GpsError ? err.code : "unavailable";
      setFailureCode(code);
      setStatus(code === "denied" ? "denied" : "unavailable");
      setError(err instanceof Error && err.message ? err.message : describeGpsFailure(code));
      // Returning null rather than throwing: the form continues either way.
      return null;
    }
  }, []);

  const skip = useCallback(() => {
    setStatus("unavailable");
    setFailureCode(null);
    setError(describeGpsFailure("unavailable"));
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setGpsData(null);
    setError(null);
    setFailureCode(null);
    setAttempts(0);
  }, []);

  return {
    status,
    gpsData,
    error,
    failureCode,
    /** How many times the member has asked the phone for a fix. */
    attempts,
    requestLocation,
    skip,
    reset,
    /** True only once a real fix has been read. */
    hasFix: status === "success" && Boolean(gpsData),
    /** The form never waits for a location. */
    canContinue: true,
    /** Should an admin look at this one by hand? */
    needsReview: !gpsData || gpsData.suspicious,
  };
}
