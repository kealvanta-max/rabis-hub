"use client";

import { analyticsAllowed } from "@/lib/consent";

/**
 * Product analytics (PostHog), loaded only after the visitor accepts cookies and
 * only when `NEXT_PUBLIC_POSTHOG_KEY` exists — so the site ships with zero
 * third-party weight until it is configured.
 */
type Props = Record<string, unknown>;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

interface PostHogLike {
  capture: (event: string, props?: Props) => void;
  identify: (id: string, props?: Props) => void;
  reset: () => void;
}

let client: PostHogLike | null = null;
let loading: Promise<PostHogLike | null> | null = null;

async function load(): Promise<PostHogLike | null> {
  if (client) return client;
  if (!KEY || typeof window === "undefined") return null;
  if (!loading) {
    loading = import("posthog-js")
      .then(({ default: posthog }) => {
        posthog.init(KEY, {
          api_host: HOST,
          capture_pageview: false, // we send pageviews ourselves on route change
          capture_pageleave: true,
          autocapture: true,
          disable_session_recording: false,
          session_recording: { maskAllInputs: true, maskTextSelector: "[data-private]" },
          persistence: "localStorage+cookie",
          loaded: (instance) => {
            client = instance as unknown as PostHogLike;
          },
        });
        client = posthog as unknown as PostHogLike;
        return client;
      })
      .catch(() => null);
  }
  return loading;
}

/** Start analytics — call once consent is granted. */
export async function initAnalytics() {
  if (!analyticsAllowed()) return;
  await load();
}

export function track(event: string, props: Props = {}) {
  if (!analyticsAllowed()) return;
  void load().then((instance) => instance?.capture(event, props));
}

export function identify(id: string, props: Props = {}) {
  if (!analyticsAllowed()) return;
  void load().then((instance) => instance?.identify(id, props));
}

export function resetAnalytics() {
  void load().then((instance) => instance?.reset());
}
