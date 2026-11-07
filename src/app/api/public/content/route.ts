import { NextResponse } from "next/server";

import { adminFirestore } from "@/lib/server-firestore";

/**
 * Public marketing data, read on the server so the landing page never talks to
 * Firestore from the browser.
 *
 * Why this exists: the home page used to open a Firestore channel to read
 * testimonials and the admin managed plans. On a slow or proxied connection that
 * channel times out, and the browser writes "Failed to load resource:
 * net::ERR_TIMED_OUT" to the console, which is a real error a visitor can see in
 * devtools and the one thing keeping Best Practices off 100.
 *
 * Reading it here instead gives three wins: no third party connection before the
 * page is interactive, one cached response for every visitor instead of a read
 * per visitor, and nothing for the browser to fail at.
 *
 * Every failure path returns an empty payload with 200, so the page falls back
 * to its own published plans and approved quotes instead of showing an error.
 */

export const dynamic = "force-dynamic";

interface PublicTestimonial {
  id: string;
  userId: string;
  userName: string;
  planName: string;
  rating: number;
  review: string;
  createdAt: number;
}

const EMPTY = { testimonials: [] as PublicTestimonial[], customPlans: [] as unknown[] };

const FALLBACK_HEADERS = { "Cache-Control": "no-store" };
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

export async function GET() {
  const db = await adminFirestore();

  if (!db) {
    // No service account on this deployment. The page keeps its own content.
    return NextResponse.json(EMPTY, { headers: FALLBACK_HEADERS });
  }

  try {
    const [plansSnapshot, testimonialsSnapshot] = await Promise.all([
      db.collection("settings").doc("customPlans").get(),
      db.collection("testimonials").where("status", "==", "approved").limit(20).get(),
    ]);

    const rawPlans: unknown = plansSnapshot.exists ? plansSnapshot.get("plans") : null;
    const customPlans: unknown[] = Array.isArray(rawPlans) ? rawPlans : [];

    /*
     * The document shape is stated here rather than inferred. The Admin SDK's
     * generics differ between installs, and inferring them made CI fail on a
     * parameter that was fine locally. An explicit shape cannot drift.
     */
    type DocumentLike = { id: string; data: () => Record<string, unknown> };
    const documents = testimonialsSnapshot.docs as unknown as DocumentLike[];

    const testimonials = documents
      .map((document: DocumentLike) => {
        const data = document.data() as {
          userId?: unknown;
          userName?: unknown;
          planName?: unknown;
          rating?: unknown;
          review?: unknown;
          createdAt?: { toMillis?: () => number };
        };

        return {
          id: document.id,
          userId: typeof data.userId === "string" ? data.userId : "",
          userName: typeof data.userName === "string" ? data.userName : "Member",
          planName: typeof data.planName === "string" ? data.planName : "",
          rating: typeof data.rating === "number" ? data.rating : 5,
          review: typeof data.review === "string" ? data.review : "",
          createdAt: typeof data.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : 0,
        };
      })
      .filter((entry) => entry.review.length > 0)
      .sort((a: PublicTestimonial, b: PublicTestimonial) => b.createdAt - a.createdAt)
      .slice(0, 10);

    return NextResponse.json({ testimonials, customPlans }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json(EMPTY, { headers: FALLBACK_HEADERS });
  }
}
