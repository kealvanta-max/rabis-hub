import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server-auth";
import { ootoConfigured } from "@/lib/ooto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Are the identity-service keys actually working?"
 *
 * The server runs on Vercel, which can reach OOTO; the development sandbox
 * cannot, so the credentials have to be proven from production. This sends a
 * one pixel PNG, which is too small to analyse, and reads the answer:
 *
 *   401 or 403  the keys are wrong or inactive
 *   400 + code  the keys are fine and the engine simply refused a 1px image
 *
 * Owner only, and it never touches a member's documents.
 */

// A 1x1 transparent PNG.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(request: Request) {
  const actor = await authenticateRequest(request);
  if (!actor) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }
  if (!actor.admin) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  if (!ootoConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        summary:
          "OOTO_APP_ID and OOTO_APP_KEY are not set on the server, so the on-device checks are still the only ones running.",
      },
      { status: 503 }
    );
  }

  const form = new FormData();
  form.append("photo", new Blob([TINY_PNG], { type: "image/png" }), "probe.png");

  try {
    const response = await fetch("https://cloud.ooto-ai.com/api/v1.0/liveness", {
      method: "POST",
      headers: {
        "APP-ID": (process.env.OOTO_APP_ID || "").trim(),
        "APP-KEY": (process.env.OOTO_APP_KEY || "").trim(),
      },
      body: form,
      cache: "no-store",
    });

    const text = await response.text().catch(() => "");
    const rejected = response.status === 401 || response.status === 403;

    let engineCode: number | undefined;
    try {
      const parsed = JSON.parse(text) as { result?: { code?: number } };
      engineCode = parsed.result?.code;
    } catch {
      engineCode = undefined;
    }

    return NextResponse.json(
      {
        ok: !rejected,
        configured: true,
        httpStatus: response.status,
        engineCode,
        summary: rejected
          ? "The identity service rejected these credentials. Check OOTO_APP_ID and OOTO_APP_KEY."
          : "The identity service accepted the credentials. A 1 pixel image was refused by the engine, which is the expected answer.",
        detail: text.slice(0, 300),
        checkedAt: new Date().toISOString(),
      },
      { status: rejected ? 502 : 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        summary: "Could not reach the identity service from the server.",
        detail: (error as Error).message.slice(0, 300),
      },
      { status: 502 }
    );
  }
}
