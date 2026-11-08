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
}

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
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

export async function rateLimit(
  key: string,
  limit = 10,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;

  if (!upstashConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("[rate-limit] durable Upstash limiter is required in production.");
      return { success: false, remaining: 0, resetAt: Date.now() + windowMs, backend: "memory" };
    }
    return memoryLimit(key, limit, windowMs);
  }

  try {
    const redisKey = `rl:${key}`;
    const [, , count] = await upstashPipeline([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, windowSeconds, "NX"],
      ["TTL", redisKey],
    ]);

    const used = Number(count?.result ?? 1);
    const ttl = Math.max(windowSeconds, 1);

    return {
      success: used <= limit,
      remaining: Math.max(0, limit - used),
      resetAt: Date.now() + ttl * 1000,
      backend: "upstash",
    };
  } catch (error) {
    // Never take the site down because the limiter is unreachable.
    console.error("[rate-limit] durable Upstash limiter unavailable:", (error as Error).message);
    if (process.env.NODE_ENV === "production") {
      return { success: false, remaining: 0, resetAt: Date.now() + windowMs, backend: "memory" };
    }
    return memoryLimit(key, limit, windowMs);
  }
}

/** Best-effort client identity for rate limiting behind Vercel's proxy. */
export function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}
