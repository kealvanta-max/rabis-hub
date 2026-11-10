import { NextResponse } from "next/server";

import { criticalGaps, integrationStatus } from "@/lib/integrations";
import { authenticateRequest } from "@/lib/server-auth";
import {
  overallState,
  probeCapabilities,
  type Capability,
  type CapabilityId,
} from "@/lib/capability-probe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/*
 * The health endpoint.
 *
 * It used to answer "are these variables non-empty", which is a question that
 * was never the problem. Every environment variable was present the two times
 * production broke, and the endpoint said "misconfigured" without saying which
 * of the four ways the service account failed to parse.
 *
 * Now it exercises the real code paths: it reads and writes a scratch Firestore
 * document, asks Cloudinary's own /ping, starts the OCR worker, and feeds a
 * blank image to the face screen expecting a refusal. Each capability reports
 * ready / degraded / broken / off, one plain sentence, the exact error text, and
 * what a member sees while it is in that state.
 *
 * "off" is a supported state, not a fault: no AI provider and log-mode mail are
 * both deliberate. Only "broken" stops a signup.
 */

export async function GET(request: Request) {
  const actor = await authenticateRequest(request).catch(() => null);
  const build = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "local";

  /*
   * Public callers, which includes uptime monitors, get the verdict and the
   * build only. The capability detail is a map of the deployment's internals:
   * useful to whoever is fixing it, useful to whoever is attacking it.
   */
  if (!actor?.admin) {
    let state: string = "unknown";
    try {
      const summary = await probeCapabilities();
      state = overallState(summary);
    } catch {
      state = "broken";
    }
    return NextResponse.json(
      { status: state, build },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const capabilities = await probeCapabilities();
  const state = overallState(capabilities);
  const integrations = integrationStatus();

  /*
   * The names only, in a shape a monitor or a test can assert on, so nobody has
   * to parse prose to find out whether signup works today.
   */
  const failing = Object.entries(capabilities)
    .filter(([, c]) => c.state === "broken")
    .map(([id]) => id as CapabilityId);
  const degraded = Object.entries(capabilities)
    .filter(([, c]) => c.state === "degraded")
    .map(([id]) => id as CapabilityId);

  const ordered: Record<string, Capability> = {};
  for (const id of ["firestore", "cloudinary", "cardReader", "faceCheck", "vision", "email", "rateLimiting"]) {
    if (capabilities[id]) ordered[id] = capabilities[id];
  }

  return NextResponse.json(
    {
      status: state,
      /* Can a member complete a signup right now? That is the whole question. */
      signupWorks: !failing.includes("firestore") && !failing.includes("cloudinary"),
      failing,
      degraded,
      capabilities: ordered,
      build,

      /*
       * The old surface is kept, because the admin panel reads it and because
       * the presence check is still worth seeing next to the live probe: when
       * they disagree, the variable is set but wrong, which is the exact
       * failure that cost a full evening.
       */
      integrations: integrations.map(({ id, label, category, configured, missing }) => ({
        id,
        label,
        category,
        configured,
        missing,
      })),
      criticalGaps: criticalGaps(),
      mailMode: (process.env.MAIL_MODE || "").toLowerCase() === "live" ? "live" : "log",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

