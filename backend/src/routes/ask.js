"use strict";

const express = require("express");
const store = require("../lib/store");
const { interpret } = require("../lib/intentEngine");
const { resolve, runSearch } = require("../lib/resolve");
const { confirm, ActionError } = require("../lib/actions");
const { BRANCHES, TICKET_PAGES, BUS_ROUTES } = require("../data/seed");

const router = express.Router();

function candidateLists() {
  return {
    studentNames: store.students.map((s) => s.name),
    staffNames: store.staff.map((s) => s.name),
    branches: BRANCHES,
    ticketPages: TICKET_PAGES,
    busRoutes: BUS_ROUTES,
  };
}

function badRequest(res, message) {
  res.status(400).json({ error: message, code: "bad_request" });
}

// POST /api/ask/interpret - Tier 1 only. No DB access, no side effects.
// Async because the LLM engine (see lib/intentEngine.js) makes a network
// call; the rule-based engine resolves synchronously either way.
router.post("/interpret", async (req, res, next) => {
  const query = req.body && req.body.query;
  if (typeof query !== "string" || !query.trim()) {
    return badRequest(res, "query is required");
  }
  if (query.length > 300) {
    return badRequest(res, "query is too long (max 300 characters)");
  }
  try {
    const intent = await interpret(query.trim(), candidateLists());
    store.appendAudit({ event: "interpret", query, intent });
    res.json(intent);
  } catch (err) {
    next(err);
  }
});

// POST /api/ask/resolve - Tier 2. Read-only; runs search directly, or returns
// disambiguation candidates for write actions. Never executes anything.
router.post("/resolve", (req, res) => {
  const { action, entity, target, filters, params } = req.body || {};
  if (!action) return badRequest(res, "action is required");

  if (action === "search") {
    if (!entity) return badRequest(res, "entity is required for a search action");
    const result = runSearch(entity, filters || {});
    return res.json({ status: "ok", ...result });
  }

  const result = resolve(action, target || {}, params || {});
  res.json(result);
});

// POST /api/ask/confirm - Executes. Requires a resolved target from /resolve.
router.post("/confirm", (req, res) => {
  const { action, student_id, resolved_name, resolved_class, receipt_no, params } = req.body || {};
  if (!action) return badRequest(res, "action is required");

  try {
    const result = confirm(action, { student_id, resolved_name, resolved_class, receipt_no, params: params || {} });
    res.json(result);
  } catch (err) {
    if (err instanceof ActionError) {
      const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

module.exports = router;
