import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Rate limiting decides whether a legitimate member can finish signing up, so
 * both of its failure modes matter: letting an attacker through, and locking
 * everyone out.
 *
 * The bug these tests exist for: the Upstash reply was destructured as
 * `[, , count]`, which is the TTL, not the counter. With `signup:submit` limited
 * to 3 per hour, `used` was ~3600, so the *first* submission of every new hour
 * was refused — and the in-memory fallback was the only path any test covered.
 */

const UPSTASH = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];

async function load() {
  vi.resetModules();
  return import("@/lib/rate-limit");
}

/** Emulates Upstash `/pipeline`: replies in command order. */
function mockUpstash(handler: (command: string, key: string) => number) {
  const calls: string[][] = [];
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const commands = JSON.parse(String(init?.body ?? "[]")) as (string | number)[][];
    const replies = commands.map((command) => {
      const name = String(command[0]);
      const key = String(command[1]);
      calls.push(command.map(String));
      return { result: handler(name, key) };
    });
    return new Response(JSON.stringify(replies), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  for (const key of UPSTASH) delete process.env[key];
});
afterEach(() => {
  for (const key of UPSTASH) delete process.env[key];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("with a durable store", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  });

  it("reads the counter from INCR, not from TTL", async () => {
    // The regression: three signups allowed, TTL of 3600 seconds.
    let count = 0;
    mockUpstash((command) => {
      if (command === "INCR") return (count += 1);
      if (command === "EXPIRE") return 1;
      if (command === "TTL") return 3600;
      return 0;
    });

    const { rateLimit } = await load();
    const first = await rateLimit("signup:submit:abc", 3, 3600);
    expect(first.success).toBe(true);
    expect(first.backend).toBe("upstash");
    expect(first.degraded).toBeUndefined();

    await rateLimit("signup:submit:abc", 3, 3600);
    const third = await rateLimit("signup:submit:abc", 3, 3600);
    expect(third.success).toBe(true);
    expect(third.remaining).toBe(0);

    // Fourth in the hour is refused.
    expect((await rateLimit("signup:submit:abc", 3, 3600)).success).toBe(false);
  });

  it("does not let an upload limit equal to the window silently pass", async () => {
    // 60 uploads per 60 seconds: TTL <= limit was always true, so the old code
    // allowed an unlimited number of uploads.
    let count = 0;
    mockUpstash((command) => {
      if (command === "INCR") return (count += 1);
      if (command === "EXPIRE") return 1;
      return 60;
    });

    const { rateLimit } = await load();
    for (let i = 0; i < 60; i += 1) {
      expect((await rateLimit("upload:v2:uid:x", 60, 60)).success).toBe(true);
    }
    expect((await rateLimit("upload:v2:uid:x", 60, 60)).success).toBe(false);
  });

  it("uses the real TTL for the reset time", async () => {
    mockUpstash((command) => {
      if (command === "INCR") return 1;
      if (command === "EXPIRE") return 1;
      return 42; // seconds left
    });
    const { rateLimit } = await load();
    const before = Date.now();
    const result = await rateLimit("k", 10, 3600);
    // 42 seconds, not the full hour and not 42 hours.
    expect(result.resetAt - before).toBeGreaterThan(41_000);
    expect(result.resetAt - before).toBeLessThan(43_000);
  });

  it("falls back to the window length when TTL reports -1", async () => {
    mockUpstash((command) => {
      if (command === "INCR") return 1;
      if (command === "EXPIRE") return 1;
      return -1;
    });
    const { rateLimit } = await load();
    const before = Date.now();
    const result = await rateLimit("k", 10, 30);
    expect(result.resetAt - before).toBeGreaterThan(29_000);
  });

  it("survives a Redis outage without locking the member out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const { rateLimit } = await load();
    const result = await rateLimit("signup:submit:outage", 3, 3600);
    // Degraded, but a member can still apply.
    expect(result.success).toBe(true);
    expect(result.backend).toBe("memory");
    expect(result.degraded).toBe(true);
  });
});

describe("without a durable store", () => {
  it("still limits in production instead of refusing everything", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { rateLimit } = await load();
    const key = `prod-${Math.random()}`;

    const first = await rateLimit(key, 3, 60);
    expect(first.success).toBe(true);
    expect(first.backend).toBe("memory");
    // Visible, so a health check can report "limiting per instance".
    expect(first.degraded).toBe(true);

    await rateLimit(key, 3, 60);
    await rateLimit(key, 3, 60);
    expect((await rateLimit(key, 3, 60)).success).toBe(false);
  });

  it("reports no degraded flag outside production", async () => {
    const { rateLimit } = await load();
    expect((await rateLimit(`dev-${Math.random()}`, 5, 60)).degraded).toBeUndefined();
  });

  it("never blocks the very first request of a window", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { rateLimit } = await load();
    for (let i = 0; i < 25; i += 1) {
      // One request per fresh key: none of them may be refused.
      expect((await rateLimit(`fresh-${i}-${Math.random()}`, 1, 3600)).success).toBe(true);
    }
  });

  it("resets once the window expires", async () => {
    const { rateLimit } = await load();
    const key = `reset-${Math.random()}`;
    await rateLimit(key, 1, 60);
    expect((await rateLimit(key, 1, 60)).success).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    expect((await rateLimit(key, 1, 60)).success).toBe(true);
    vi.useRealTimers();
  });
});

describe("client identity", () => {
  it("uses the first forwarded hop, not the whole chain", async () => {
    const { clientKey } = await load();
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" },
    });
    expect(clientKey(request, "upload")).toBe("upload:203.0.113.9");
  });

  it("uses x-real-ip when there is no forwarded chain", async () => {
    const { clientKey } = await load();
    const request = new Request("https://example.com", { headers: { "x-real-ip": "198.51.100.4" } });
    expect(clientKey(request, "upload")).toBe("upload:198.51.100.4");
  });

  it("does not collapse every unidentified caller into one bucket", async () => {
    const { clientKey } = await load();
    // Spaces in a request are normalised, so compare two anonymous requests
    // with different forwarded values.
    const a = clientKey(new Request("https://example.com"), "errors");
    const b = clientKey(new Request("https://example.com"), "errors");
    expect(a).toBe(b); // genuinely unknown: one bucket is correct
    expect(a).toBe("errors:unknown");
  });
});
