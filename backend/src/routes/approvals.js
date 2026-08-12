"use strict";

const express = require("express");
const store = require("../lib/store");
const { decideApproval, ActionError } = require("../lib/actions");

const router = express.Router();

// GET /api/approvals?role=admin_officer|principal&branch=...&status=pending
// Scoped listing so an approver only ever sees what they're allowed to act on
// (spec section 7.3). No auth system here (see README) - role/branch are
// query params for demo purposes; wire this to req.user in production.
router.get("/", (req, res) => {
  const { role, branch, status } = req.query;
  let rows = store.pendingApprovals;
  if (role) rows = rows.filter((a) => a.approver_role === role);
  if (branch) rows = rows.filter((a) => a.branch === branch);
  rows = rows.filter((a) => a.status === (status || "pending"));

  const enriched = rows.map((a) => ({
    ...a,
    student: store.students.find((s) => s.id === a.student_id) || null,
  }));
  res.json({ approvals: enriched });
});

// POST /api/approvals/:id/decision  { decision: "approve"|"reject", decided_by? }
router.post("/:id/decision", (req, res) => {
  const { decision, decided_by } = req.body || {};
  try {
    const approval = decideApproval(req.params.id, decision, decided_by);
    res.json({ status: "ok", approval });
  } catch (err) {
    if (err instanceof ActionError) {
      const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

module.exports = router;
