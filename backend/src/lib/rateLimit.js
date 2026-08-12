"use strict";

/**
 * Minimal in-memory, per-IP sliding-window rate limiter - no extra dependency,
 * good enough for a single-process deployment. See
 * docs/Ask_the_ERP_Developer_Spec.pdf section 10.2: the interpret/resolve
 * endpoints should be rate-limited to prevent enumerating student names via
 * repeated fuzzy queries. Swap for a shared store (e.g. Redis) behind a load
 * balancer with more than one process.
 */
function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const key = req.ip || "unknown";
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs);
    timestamps.push(now);
    hits.set(key, timestamps);

    if (timestamps.length > max) {
      res.status(429).json({ error: "Too many requests, slow down.", code: "rate_limited" });
      return;
    }
    next();
  };
}

module.exports = { rateLimit };
