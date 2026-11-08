"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  detectGps,
  describeGpsFailure,
  GpsError,
  type GpsFailureCode,
  type GpsResult,
} from "@/lib/geolocation";

/**
 * How many consecutive failed detections reveal manual entry.
 *
 * This is a fraud control, not a UX nicety. Manual entry is the only part of
 * the location step a member can fabricate, so it must cost something to reach:
 * three genuine, completed attempts against the device's own location service.
 * "Denied" and "unavailable" are both counted, because both mean the phone did
 * not give us a pin.
 */
export const LOCATION_ATTEMPT_LIMIT = 3;

export type GpsStatus = "idle" | "detecting" | "success" | "denied" | "unavailable";

export function useGeolocation() {
  const [status, setStatus] = useState<GpsStatus>("idle");
  const [gpsData, setGpsData] = useState<GpsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failureCode, setFailureCode] = useState<GpsFailureCode | null>(null);
  const [attempts, setAttempts] = useState(0);

  /*
   * A ref mirrors the counter so two fast taps cannot both read a stale state
   * value and count as one attempt, and so a member cannot inflate the count by
   * tapping while an attempt is already in flight.
   */
  const inFlight = useRef(false);
  const attemptsRef = useRef(0);

  const requestLocation = useCallback(async () => {
    // A second tap during an in-flight fix is not a new attempt.
    if (inFlight.current) return null;
    inFlight.current = true;

    setStatus("detecting");
    setError(null);
    setFailureCode(null);

    try {
      const result = await detectGps();
      setGpsData(result);
      attemptsRef.current = 0; // Only *consecutive* failures reveal manual entry.
      setAttempts(0);
      setStatus("success");
      /*
       * A pin outside Ghana is kept, not hidden. Rabi sees the flag and can ask
       * about it, which is better than pretending the member has no location.
       */
      setError(result.suspicious ? result.reason ?? null : null);
      return result;
    } catch (err) {
      const next = Math.min(attemptsRef.current + 1, LOCATION_ATTEMPT_LIMIT);
      attemptsRef.current = next;
      setAttempts(next);
      const code: GpsFailureCode = err instanceof GpsError ? err.code : "unavailable";
      setFailureCode(code);
      setStatus(code === "denied" ? "denied" : "unavailable");
      setError(err instanceof Error && err.message ? err.message : describeGpsFailure(code));
      // Returning null rather than throwing: the form continues either way.
      return null;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    inFlight.current = false;
    attemptsRef.current = 0;
    setStatus("idle");
    setGpsData(null);
    setError(null);
    setFailureCode(null);
    setAttempts(0);
  }, []);

  /** Manual entry is unreachable until the phone has genuinely failed three times. */
  const manualEntryUnlocked = attempts >= LOCATION_ATTEMPT_LIMIT && status !== "success";
  const attemptsRemaining = Math.max(0, LOCATION_ATTEMPT_LIMIT - attempts);

  return {
    status,
    gpsData,
    error,
    failureCode,
    /** Consecutive failed detections, capped at the limit. */
    attempts,
    attemptsRemaining,
    attemptLimit: LOCATION_ATTEMPT_LIMIT,
    /** Includes the attempt currently in flight, for "Attempt 2 of 3". */
    attemptNumber: Math.min(attempts + (status === "detecting" ? 1 : 0), LOCATION_ATTEMPT_LIMIT),
    manualEntryUnlocked,
    requestLocation,
    reset,
    /** True only once a real fix has been read. */
    hasFix: status === "success" && Boolean(gpsData),
    /** The form never waits for a location. */
    canContinue: true,
    /** Should an admin look at this one by hand? */
    needsReview: !gpsData || gpsData.suspicious,
    /** What went on the record: a real fix, or the member's own words. */
    source: useMemo(() => (gpsData ? gpsData.source : "manual" as const), [gpsData]),
  };
}
