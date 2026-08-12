"use strict";

const express = require("express");
const cors = require("cors");
const { rateLimit } = require("./lib/rateLimit");
const askRouter = require("./routes/ask");
const approvalsRouter = require("./routes/approvals");

function createApp() {
  const app = express();

  // Needed for req.ip to reflect the real client (not the proxy) when hosted
  // behind Render/Railway/Heroku/etc.'s load balancer.
  if (process.env.TRUST_PROXY) app.set("trust proxy", 1);

  // Backend and frontend are separate deployables (different folders, likely
  // different hosts/ports), so this is a real cross-origin API - CORS has to
  // be explicit rather than "same origin, don't worry about it". Restrict
  // CORS_ORIGIN to your actual frontend's URL once you have one; "*" is fine
  // for local development but see README.md "Before exposing this to real
  // users" before using it in production.
  const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map((o) => o.trim());
  app.use(cors({ origin: allowedOrigins.includes("*") ? true : allowedOrigins }));

  app.use(express.json({ limit: "10kb" }));

  app.get("/", (req, res) => res.json({ name: "Ask the ERP API", docs: "/api/health, /api/ask/*, /api/approvals" }));
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.get("/favicon.ico", (req, res) => res.status(204).end());

  app.use("/api/ask", rateLimit({ windowMs: 60_000, max: 60 }), askRouter);
  app.use("/api/approvals", rateLimit({ windowMs: 60_000, max: 60 }), approvalsRouter);

  app.use((req, res) => res.status(404).json({ error: "Not found", code: "not_found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error", code: "internal_error" });
  });

  return app;
}

module.exports = { createApp };
