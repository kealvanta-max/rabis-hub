/**
 * Cookie / analytics consent, stored locally and shared through a tiny event bus
 * so any component can react without a state library.
 */

export type ConsentValue = "granted" | "essential-only";

const STORAGE_KEY = "rabi-consent-v1";
const EVENT = "rabi:consent";

export function getConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "granted" || raw === "essential-only" ? raw : null;
  } catch {
    return null;
  }
}

export function setConsent(value: ConsentValue) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode — consent simply won't persist */
  }
  window.dispatchEvent(new CustomEvent<ConsentValue>(EVENT, { detail: value }));
}

export function onConsentChange(handler: (value: ConsentValue) => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => handler((event as CustomEvent<ConsentValue>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export const analyticsAllowed = () => getConsent() === "granted";
