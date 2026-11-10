import { NextResponse } from "next/server";

import { diagnoseServiceAccount } from "@/lib/service-account";
import { firestoreProjectId } from "@/lib/server-firestore";
import { authenticateRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * "Which way is the key wrong?"
 *
 * This route exists for one question that could not be answered from outside:
 * the service account was set, fresh, and correct-looking, and every signup
 * still failed. Presence is not parseability, and parseability is not
 * acceptance. `/api/health` answers the third question with a real read; this
 * route answers the second with a precise reason, so the fix is one paste away
 * instead of an evening of reading logs.
 *
 * Admin only. The payload is a description of the deployment's internals: it
 * contains no secret, but it does tell an attacker exactly which door is open.
 */
export async function GET(request: Request) {
  const actor = await authenticateRequest(request).catch(() => null);

  if (!actor?.admin) {
    /*
     * Anonymous callers get one bit: does the server hold a key that parses? A
     * monitor needs that. Nobody needs the rest.
     */
    return NextResponse.json(
      { ok: diagnoseServiceAccount().problem === "ok" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const diagnosis = diagnoseServiceAccount();

  return NextResponse.json(
    {
      ok: diagnosis.problem === "ok",
      problem: diagnosis.problem,
      summary: diagnosis.summary,
      fix: diagnosis.fix,
      variable: diagnosis.variable,
      /* Names and shapes only; the key itself is never in here. */
      shape: diagnosis.shape,
      projectIdExpected: firestoreProjectId(),
      /*
       * A mismatch is its own failure mode: a key from the wrong project signs
       * perfectly and writes to a database nobody is reading. Worth saying out
       * loud rather than letting it look healthy.
       */
      projectMatchesConfig:
        diagnosis.shape.projectId === null
          ? null
          : diagnosis.shape.projectId === firestoreProjectId(),
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
