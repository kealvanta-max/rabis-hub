/**
 * Distributed rate limiting.
 *
 * Uses Upstash Redis REST when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 * are configured (survives serverless cold starts and multiple instances) and
 * transparently falls back to an in-memory counter otherwise, so local dev and
 * a fresh deploy both work with zero setup.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Epoch milliseconds when the current window resets. */
  resetAt: number;
  backend: "upstash" | "memory";
  /**
   * Set when the durable limiter could not be consulted and the answer came
   * from a single instance's memory. Callers surface this on health checks; it
   * means the limit is per-instance, not global.
   */
  degraded?: boolean;
}

const memory = new Map<string, { count: number; resetAt: number }>();

/**
 * Ask Upstash whether it is reachable before using it in production.
 *
 * The fallback below is an in-process counter, and on Vercel that means the
 * budget resets every time a cold instance starts. A script that posts slowly
 * enough to keep triggering new instances effectively has no limit at all — and
 * that is exactly the shape of the free-tier drain this guards against.
 *
 * So the decision is not "is it configured" but "did it ever answer". Until it
 * does, production refuses anonymous KYC uploads outright rather than pretending
 * a per-instance counter is a global one. Members who are signed in are never
 * refused: their budget is per-uid and they have an account to lose.
 */
let durableVerified: boolean | null = null;

export function durableLimiterVerified(): boolean | null {
  return durableVerified;
}

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepMemory(now);
  const entry = memory.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    memory.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, resetAt, backend: "memory" };
  }

  entry.count += 1;
  return {
    success: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
    backend: "memory",
  };
}

function upstashConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function upstashPipeline(commands: (string | number)[][]) {
  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Upstash ${response.status}`);
  return (await response.json()) as { result: number }[];
}

/**
 * Choose between the durable and the per-instance limiter.
 *
 * This used to fail *closed*: with no Upstash credentials in production it
 * returned `success: false` for every key. That turns a missing optional
 * dependency into a total outage, and the routes it guards are the ones a
 * member cannot work around — signup submission, evidence upload, the error
 * reporter, admin decisions. A member with a completed application would be
 * told "too many requests" forever, with nothing in the UI to explain it.
 *
 * The correct default is to degrade, not to deny: fall back to the in-process
 * counter, which is still a real limit (per warm instance) and is enough to
 * blunt a single-source flood. Anything stronger requires a shared store, so
 * the degraded flag is reported rather than hidden.
 */
export async function rateLimit(
  key: string,
  limit = 10,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;

  if (!upstashConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are not set; limiting per instance instead of globally."
      );
    }
    const result = memoryLimit(key, limit, windowMs);
    // Only set the flag when it means something; `degraded: false` on a dev
    // response is noise for callers that serialise it into a health payload.
    return process.env.NODE_ENV === "production" ? { ...result, degraded: true } : result;
  }

  try {
    const redisKey = `rl:${key}`;
    /*
     * Pipeline replies come back in command order, so the count is index 0.
     *
     * This previously destructured `[, , count]`, which is the TTL. The effect
     * was silent and severe: `used` was the number of seconds left in the
     * window, so a limit smaller than the window length (signup: 3 per hour)
     * blocked the very first request, and a limit equal to the window length
     * (upload: 60 per minute) compared TTL <= limit and allowed unlimited
     * uploads. Both directions were wrong, and only the memory fallback was
     * ever covered by a test.
     */
    const [count, , ttl] = await upstashPipeline([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, windowSeconds, "NX"],
      ["TTL", redisKey],
    ]);

    const used = Number(count?.result ?? 1);
    const ttlSeconds = Number(ttl?.result ?? -1);
    const secondsLeft = ttlSeconds > 0 ? ttlSeconds : windowSeconds;

    // It answered with a real count, so it is genuinely enforcing something.
    if (durableVerified !== true) {
      durableVerified = true;
      console.info("[rate-limit] durable Upstash limiter is live; limits are global.");
    }

    return {
      success: used <= limit,
      remaining: Math.max(0, limit - used),
      resetAt: Date.now() + secondsLeft * 1000,
      backend: "upstash",
    };
  } catch (error) {
    /*
     * Never take general traffic down because the limiter is unreachable: degrade
     * to the in-process counter and say so. Callers that guard money or quota can
     * check `degraded` and refuse — see the upload route.
     */
    console.error("[rate-limit] durable Upstash limiter unavailable:", (error as Error).message);
    durableVerified = false;
    return { ...memoryLimit(key, limit, windowMs), degraded: true };
  }
}

/**
 * Bound the in-memory map so a high-cardinality key (an attacker rotating IPs)
 * cannot grow it without limit. Expired windows are dropped first, then the
 * oldest entries, which is enough for a fallback path.
 */
const MEMORY_CEILING = 10_000;

function sweepMemory(now: number) {
  // Collect first, then delete: mutating a Map during iteration is legal but
  // behaves differently across engines.
  const expired: string[] = [];
  memory.forEach((entry, key) => {
    if (entry.resetAt <= now) expired.push(key);
  });
  for (const key of expired) memory.delete(key);
  if (memory.size <= MEMORY_CEILING) return;

  // Still too big: drop the oldest insertions. Map preserves insertion order,
  // and a limiter key that has not been touched since it was created is the
  // safest thing to forget.
  const excess: string[] = [];
  const keep = memory.size - MEMORY_CEILING;
  let seen = 0;
  memory.forEach((_entry, key) => {
    if (seen < keep) {
      excess.push(key);
      seen += 1;
    }
  });
  for (const key of excess) memory.delete(key);
}

/** Best-effort client identity for rate limiting behind Vercel's proxy. */
export function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}
