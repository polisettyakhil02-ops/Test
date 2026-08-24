import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // MongoDB replica set connection string, e.g.
  // mongodb://mongo1:27017,mongo2:27017,mongo3:27017/hims?replicaSet=rs0
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900), // 15 min
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(1209600), // 14 days

  // Step 16: the mobile gateway's own token space. Falls back to
  // JWT_ACCESS_SECRET when unset (so existing deployments keep working
  // without a new required secret) — the real isolation from the web
  // session comes from the mandatory `aud: "hims-mobile"` claim every
  // mobile token carries and every mobile-route verification enforces
  // (see utils/jwt.ts), not from the secret alone. Set this separately in
  // production to rotate the mobile app's tokens independently of the web
  // SPA's.
  JWT_MOBILE_ACCESS_SECRET: z.string().min(32, "JWT_MOBILE_ACCESS_SECRET must be at least 32 chars").optional(),
  JWT_MOBILE_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(600), // 10 min — shorter-lived than the web session

  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 chars"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),

  UHID_PREFIX: z.string().default("HIMS"),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(2555), // 7 years
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
