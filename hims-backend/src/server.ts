import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { redis } from "./config/redis.js";

/**
 * Entry point. Route/controller wiring for the 6 domain modules (OPD,
 * IPD, EMR, Pharmacy, LIMS, Billing) lands in Step 3 of the roadmap —
 * this bootstraps the security/observability core (Step 2) plus a
 * liveness/readiness check so the container can be deployed and health-
 * checked ahead of that.
 */

async function main(): Promise<void> {
  await connectDatabase();

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

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", async (_req, res) => {
    const mongoReady = (await import("mongoose")).default.connection.readyState === 1;
    const redisReady = redis.status === "ready";
    const ready = mongoReady && redisReady;
    res.status(ready ? 200 : 503).json({ mongo: mongoReady, redis: redisReady });
  });

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[hims-backend] listening on :${env.PORT} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[hims-backend] fatal startup error", err);
  process.exit(1);
});
