import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server-auth";
import { firestoreProjectId } from "@/lib/server-firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CollectionVerdict = "denied" | "permitted" | "unknown";

interface Probe {
  verdict: CollectionVerdict;
  status: number;
  detail?: string;
}

async function probeAnonymous(path: string): Promise<Probe> {
  const project = firestoreProjectId();
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}` +
    `/databases/(default)/documents${path}` +
    (key ? `?key=${encodeURIComponent(key)}` : "");

  try {
    // Deliberately no Authorization header: this is exactly what a stranger on
    // the internet can do, so the answer describes the deployed rules, not our
    // server's privileges.
    const response = await fetch(url, { cache: "no-store" });

    if (response.status === 200) {
      return { verdict: "permitted", status: 200 };
    }

    // 404 means the rules LET the request through and the document simply is
    // not there. That distinction matters: the public plan list is legitimately
    // absent until Rabi creates a custom plan, and reading it as "denied" would
    // make a healthy project look broken.
    if (response.status === 404) {
      return { verdict: "permitted", status: 404 };
    }

    if (response.status === 401 || response.status === 403) {
      return { verdict: "denied", status: response.status };
    }

    const detail = await response.text().catch(() => "");
    return { verdict: "unknown", status: response.status, detail: detail.slice(0, 160) };
  } catch (error) {
    return { verdict: "unknown", status: 0, detail: (error as Error).message.slice(0, 160) };
  }
}

/**
 * Proves what the DEPLOYED rules do, from production, without credentials.
 *
 * Reading `firestore.rules` in the repository tells you what somebody intended
 * to publish. It says nothing about the project, which may still be running the
 * permissive default. This asks the live database two questions as an anonymous
 * caller:
 *
 * - can a stranger list the `users` collection? It must be denied.
 * - can a stranger read the public plan list? It must be allowed, because the
 *   signup page depends on it. If this one is also denied, the rules were
 *   deployed but something else broke, so the two answers together separate
 *   "locked down" from "nothing works".
 *
 * Owner only, and it never reads a member's data.
 */
export async function GET(request: Request) {
  const actor = await authenticateRequest(request);
  if (!actor) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }

  if (!actor.admin) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  const [users, publicPlans] = await Promise.all([
    probeAnonymous("/users?pageSize=1"),
    probeAnonymous("/settings/customPlans"),
  ]);

  // Anything except a flat denial means a stranger reached the member list,
  // whether the collection answered with data or with an empty 404.
  const verdict =
    users.verdict === "denied"
      ? "locked"
      : users.verdict === "unknown"
      ? "unknown"
      : "exposed";

  const summary =
    verdict === "exposed"
      ? "CRITICAL: anonymous callers can reach the users collection. Deploy firestore.rules now."
      : verdict === "locked"
      ? publicPlans.verdict === "denied"
        ? "Members are protected, but the public plan list is also denied. Check the settings rules."
        : "Members are protected: anonymous reads of the users collection are denied."
      : "Could not determine the deployed rules. Run the probe again from a network that can reach Google.";

  return NextResponse.json(
    {
      ok: verdict !== "exposed",
      verdict,
      summary,
      projectId: firestoreProjectId(),
      checks: { users, publicPlans },
      checkedAt: new Date().toISOString(),
    },
    { status: verdict === "exposed" ? 409 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
