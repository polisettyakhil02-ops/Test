// Minimal in-memory, per-IP sliding-window rate limiter - no extra dependency,
// good enough for a single-process deployment. Swap for a shared store
// (e.g. Redis) behind a load balancer with more than one process.
function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs);
    timestamps.push(now);
    hits.set(key, timestamps);

    if (timestamps.length > max) {
      return res.status(429).json({ error: 'Too many requests, slow down.', code: 'rate_limited' });
    }
    next();
  };
}

module.exports = { rateLimit };
