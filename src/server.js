"use strict";

const path = require("path");
const express = require("express");
const { rateLimit } = require("./lib/rateLimit");
const askRouter = require("./routes/ask");
const approvalsRouter = require("./routes/approvals");

function createApp() {
  const app = express();

  // Needed for req.ip to reflect the real client (not the proxy) when hosted
  // behind Render/Railway/Heroku/etc.'s load balancer.
  if (process.env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(express.json({ limit: "10kb" }));

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.get("/favicon.ico", (req, res) => res.status(204).end());

  app.use("/api/ask", rateLimit({ windowMs: 60_000, max: 60 }), askRouter);
  app.use("/api/approvals", rateLimit({ windowMs: 60_000, max: 60 }), approvalsRouter);

  // Static frontend - single deployable service, no separate build/host step.
  app.use(express.static(path.join(__dirname, "..", "public")));

  // JSON 404 for unmatched API routes; let static/index.html handle the rest.
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found", code: "not_found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error", code: "internal_error" });
  });

  return app;
}

module.exports = { createApp };
