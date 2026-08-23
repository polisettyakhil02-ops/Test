import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { redis } from "./config/redis.js";
import apiRouter from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

/**
 * Builds the configured Express app without starting it — kept separate
 * from `server.ts` so the app can be constructed (and, later, exercised
 * by integration tests) without also opening a listening socket or
 * requiring a live DB/Redis connection to already be up.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1); // required for correct req.ip behind the Nginx reverse proxy

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(pinoHttp());

  // Strict brute-force guard on the credential/token-exchange auth
  // surface (login, refresh, logout). GET /api/auth/me is deliberately
  // excluded from this bucket — it's a read-only session check the
  // frontend calls on every page load/new tab (see hims-frontend's
  // AuthContext bootstrap effect and its proactive-refresh timer), has
  // no credential-guessing surface at all (it either has a valid cookie
  // or it doesn't), and would false-positive on ordinary multi-tab usage
  // under a 5-per-15-minute cap; it falls through to the standard
  // limiter below instead. Nginx (docker/nginx/default.conf) adds a
  // second, edge-level limiter on /api/auth/ in front of this one in the
  // Docker Compose topology — defense in depth, not a substitute for
  // this one, since the app may also run directly behind a different
  // load balancer that doesn't have that config.
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS", message: "Too many authentication attempts. Please try again later." },
  });
  app.use(["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"], authRateLimiter);

  const standardApiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS", message: "Too many requests. Please try again later." },
    // The three auth paths above already carry the stricter limiter above;
    // skip them here so a request is only ever charged against one
    // counter instead of two.
    skip: (req) => ["/auth/login", "/auth/refresh", "/auth/logout"].includes(req.path),
  });
  app.use("/api", standardApiRateLimiter);

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    const redisReady = redis.status === "ready";
    const ready = mongoReady && redisReady;
    res.status(ready ? 200 : 503).json({ mongo: mongoReady, redis: redisReady });
  });

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
