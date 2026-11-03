import { env } from "../env";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = 0;

/** Limit awal untuk endpoint yang relatif mahal. */
export const RATE_LIMITS = {
  questionImport: { limit: 5, windowSeconds: 60 },
  userImport: { limit: 3, windowSeconds: 60 },
  imageUpload: { limit: 20, windowSeconds: 60 },
  sessionStart: { limit: 10, windowSeconds: 60 },
  violation: { limit: 30, windowSeconds: 60 },
  answerSave: { limit: 300, windowSeconds: 60 },
  heartbeat: { limit: 120, windowSeconds: 60 },
  submit: { limit: 10, windowSeconds: 60 },
  resultsExport: { limit: 10, windowSeconds: 60 },
  crud: { limit: 60, windowSeconds: 60 },
  systemBackup: { limit: 3, windowSeconds: 300 },
  systemRestore: { limit: 3, windowSeconds: 600 },
  systemReset: { limit: 3, windowSeconds: 600 },
  systemDownload: { limit: 30, windowSeconds: 60 },
  systemStatus: { limit: 120, windowSeconds: 60 },
} as const;

function cleanup(now: number): void {
  if (buckets.size < MAX_BUCKETS && now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  lastCleanup = now;

  // Jaga agar Map tidak tumbuh tanpa batas jika banyak key unik (mis. IP palsu).
  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindowMs = Math.max(1_000, Math.floor(windowSeconds * 1_000));

  if (!env.rateLimitEnabled) {
    return {
      allowed: true,
      limit: safeLimit,
      remaining: safeLimit,
      retryAfterSeconds: 0,
      resetAt: 0,
    };
  }

  const now = Date.now();
  cleanup(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + safeWindowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= safeLimit;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));

  return {
    allowed,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - bucket.count),
    retryAfterSeconds,
    resetAt: bucket.resetAt,
  };
}

export function checkLoginRateLimit(
  ip: string,
  username: string,
): RateLimitResult {
  const ipResult = checkRateLimit(
    `login:ip:${ip}`,
    env.loginIpLimit,
    env.loginWindowSeconds,
  );
  if (!ipResult.allowed) return ipResult;

  return checkRateLimit(
    `login:user:${username.trim().toLowerCase()}`,
    env.loginUserLimit,
    env.loginWindowSeconds,
  );
}

export function resetLoginUsernameLimit(username: string): void {
  buckets.delete(`login:user:${username.trim().toLowerCase()}`);
}

export function applyRateLimitHeaders(
  set: { headers: Record<string, string | number> },
  result: RateLimitResult,
): void {
  set.headers["retry-after"] = String(result.retryAfterSeconds);
  set.headers["x-ratelimit-limit"] = String(result.limit);
  set.headers["x-ratelimit-remaining"] = String(result.remaining);
}

export function rateLimitMessage(result: RateLimitResult): string {
  return `Terlalu banyak permintaan. Coba lagi dalam ${result.retryAfterSeconds} detik.`;
}
