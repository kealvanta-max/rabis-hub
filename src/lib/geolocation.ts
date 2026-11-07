/**
 * Location, done so that it can never trap a member.
 *
 * The old version asked for a high accuracy fix with a fifteen second timeout
 * and gave up. Indoors, in a basement, or on a crowded network the phone cannot
 * get a satellite fix, so the promise rejected and the sign up screen showed a
 * red box with a button that failed the same way. People who wanted to join
 * could not.
 *
 * Now it tries twice, and it always says something useful:
 *
 * 1. High accuracy, twenty seconds. A real GPS fix when the sky is visible.
 * 2. Network accuracy, twenty seconds. A cell tower or wifi fix, which is
 *    quicker and works indoors.
 *
 * What comes back always carries its own honesty: the accuracy in metres, how
 * it was obtained, and whether the pin is somewhere a Ghanaian member could
 * plausibly be. A pin outside the country is not thrown away, it is kept and
 * flagged, because a member travelling or using a location changer is something
 * Rabi should see rather than something the form should hide.
 */

export interface GpsResult {
  lat: number;
  lng: number;
  /** Human readable place, or the coordinates when reverse geocoding fails. */
  address: string;
  /** Radius of uncertainty in metres. */
  accuracy: number;
  /** How the fix was obtained. */
  source: "gps" | "network";
  /** True when the pin is outside Ghana, or otherwise not believable. */
  suspicious: boolean;
  /** Why it was flagged, for the admin record. */
  reason?: string;
}

export type GpsFailureCode = "unsupported" | "insecure" | "denied" | "unavailable" | "timeout";

export class GpsError extends Error {
  code: GpsFailureCode;

  constructor(code: GpsFailureCode, message: string) {
    super(message);
    this.name = "GpsError";
    this.code = code;
  }
}

/** Roughly Ghana: the coast at 4.7N to the northern border at 11.2N. */
export const GHANA_BOUNDS = { minLat: 4.4, maxLat: 11.4, minLng: -3.4, maxLng: 1.3 };

export function isInGhana(lat: number, lng: number): boolean {
  return (
    lat >= GHANA_BOUNDS.minLat &&
    lat <= GHANA_BOUNDS.maxLat &&
    lng >= GHANA_BOUNDS.minLng &&
    lng <= GHANA_BOUNDS.maxLng
  );
}

/** A plain sentence a member can act on. */
export function describeGpsFailure(code: GpsFailureCode): string {
  switch (code) {
    case "denied":
      return "Location is blocked. Tap the lock icon in your browser address bar, allow Location, then try again. You can also type your area below.";
    case "unsupported":
      return "This browser cannot share a location. Type your area below and continue.";
    case "insecure":
      return "Your browser only shares location over a secure connection. Type your area below and continue.";
    case "timeout":
      return "We could not get your exact GPS location. You can proceed, but Rabi may ask for your address later.";
    case "unavailable":
    default:
      return "We could not get your exact GPS location. You can proceed, but Rabi may ask for your address later.";
  }
}

const TIMEOUT_MS = 20000;

function readPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function failureOf(error: GeolocationPositionError): GpsFailureCode {
  if (error.code === 1) return "denied";
  if (error.code === 3) return "timeout";
  return "unavailable";
}

/**
 * Asks the device for a location, falling back from GPS to network, and never
 * rejects with something a caller cannot act on.
 */
export async function detectGps(): Promise<GpsResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new GpsError("unsupported", describeGpsFailure("unsupported"));
  }

  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw new GpsError("insecure", describeGpsFailure("insecure"));
  }

  let position: GeolocationPosition | null = null;
  let firstFailure: GpsFailureCode | null = null;

  // Pass one: a real fix, for anyone who can see the sky.
  try {
    position = await readPosition({ enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 });
  } catch (error) {
    const code = failureOf(error as GeolocationPositionError);
    // A refusal is a decision, not a slow fix. Asking again would only annoy.
    if (code === "denied") throw new GpsError("denied", describeGpsFailure("denied"));
    firstFailure = code;
  }

  // Pass two: network based, quicker, and it works indoors.
  if (!position) {
    try {
      position = await readPosition({ enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 60000 });
    } catch (error) {
      const code = failureOf(error as GeolocationPositionError);
      if (code === "denied") throw new GpsError("denied", describeGpsFailure("denied"));
      throw new GpsError(code === "timeout" || firstFailure === "timeout" ? "timeout" : "unavailable", describeGpsFailure(code));
    }
  }

  const { latitude, longitude, accuracy } = position.coords;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new GpsError("unavailable", describeGpsFailure("unavailable"));
  }

  const source: GpsResult["source"] = position.coords.accuracy <= 100 ? "gps" : "network";

  let suspicious = false;
  let reason: string | undefined;

  if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) {
    suspicious = true;
    reason = "Device reported a null island position.";
  } else if (!isInGhana(latitude, longitude)) {
    suspicious = true;
    reason = "Position is outside Ghana.";
  } else if (!Number.isFinite(accuracy) || accuracy > 20000) {
    suspicious = true;
    reason = "Position is too imprecise to place.";
  }

  const address = await reverseGeocode(latitude, longitude);

  return {
    lat: latitude,
    lng: longitude,
    address,
    accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : 0,
    source,
    suspicious,
    reason,
  };
}

/**
 * A place name for the pin. Capped at six seconds: a slow lookup must never be
 * the reason a member waits, and the coordinates are a perfectly good answer.
 */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  if (typeof fetch !== "function") return fallback;

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      {
        headers: { "Accept-Language": "en" },
        signal: controller?.signal,
      }
    );

    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      address?: Record<string, string | undefined>;
      display_name?: string;
    };

    if (data.address) {
      const parts = [
        data.address.suburb || data.address.neighbourhood || data.address.village,
        data.address.city || data.address.town || data.address.state_district,
        data.address.state || data.address.region,
      ].filter(Boolean);
      return parts.join(", ") || data.display_name || fallback;
    }

    return data.display_name || fallback;
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
