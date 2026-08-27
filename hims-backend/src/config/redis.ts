import Redis from "ioredis";
import { env } from "./env.js";

/**
 * Primary Redis client. Used for:
 *  - Session / refresh-token-rotation blacklist storage
 *  - OPD token-queue counters (atomic INCR per doctor per day)
 *  - Rate limiting (express-rate-limit Redis store)
 *  - Generic read-through caching (tariff master, ICD-10 lookups, drug master)
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[redis] connection error", err);
});

export const REDIS_KEYS = {
  opdQueueToken: (doctorId: string, dateISO: string) => `opd:queue:${doctorId}:${dateISO}`,
  refreshTokenDenylist: (jti: string) => `auth:refresh:denylist:${jti}`,
  session: (sessionId: string) => `auth:session:${sessionId}`,
  rateLimit: (bucket: string, key: string) => `ratelimit:${bucket}:${key}`,
  bedAvailabilityCache: (wardId: string) => `cache:bed-availability:${wardId}`,
  tariffCache: (tariffMasterId: string) => `cache:tariff:${tariffMasterId}`,
} as const;
