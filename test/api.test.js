"use strict";

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

// Point the store at a throwaway directory before any app module is required,
// so test runs never touch the repo's real data/ directory.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "askerp-api-test-"));

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/server");
const store = require("../src/lib/store");

let server;
let base;

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

// Each test gets a freshly-seeded store, so one test's mutations (a new
// receipt, an approved concession, ...) can never change what a later test
// observes. Integration tests that silently depend on run order are a
// reliability trap - this keeps every test's fixture state predictable.
beforeEach(() => {
  store.resetForTests();
});

async function post(pathname, body) {
  const res = await fetch(base + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(pathname) {
  const res = await fetch(base + pathname);
  const data = await res.json();
  return { status: res.status, data };
}

test("GET /api/health", async () => {
  const { status, data } = await get("/api/health");
  assert.equal(status, 200);
  assert.equal(data.status, "ok");
});

test("interpret rejects an empty query", async () => {
  const { status, data } = await post("/api/ask/interpret", { query: "" });
  assert.equal(status, 400);
  assert.equal(data.code, "bad_request");
});

test("interpret + resolve: a search query returns rows directly (no disambiguation)", async () => {
  const { data: intent } = await post("/api/ask/interpret", { query: "fee report for Ravi Kumar" });
  assert.equal(intent.action, "search");
  const { data } = await post("/api/ask/resolve", { action: "search", entity: intent.entity, filters: intent.filters });
  assert.equal(data.status, "ok");
  assert.equal(data.rows.length, 2); // two same-named students
});

test("full record_payment flow: disambiguate -> pin -> confirm -> balance drops, receipt created", async () => {
  const { data: intent } = await post("/api/ask/interpret", { query: "record a payment of 5000 term fee for Ravi Kumar in class 5" });
  assert.equal(intent.action, "record_payment");

  const { data: resolved } = await post("/api/ask/resolve", { action: intent.action, target: intent.target, params: intent.params });
  assert.equal(resolved.status, "resolved");
  const student = resolved.candidate;
  assert.equal(student.name, "Ravi Kumar");
  assert.equal(student.class, "5");
  const balanceBefore = student.term_balance;

  const { status, data: confirmed } = await post("/api/ask/confirm", {
    action: "record_payment", student_id: student.id, resolved_name: student.name, resolved_class: student.class,
    params: intent.params,
  });
  assert.equal(status, 200);
  assert.equal(confirmed.status, "recorded");
  assert.match(confirmed.receipt_no, /^RC-2026-\d+$/);

  const { data: after2 } = await post("/api/ask/resolve", { action: "search", entity: "fee_records", filters: { student_name: "Ravi Kumar", class: "5" } });
  const row = after2.rows[0];
  assert.equal(row[3], "₹" + (balanceBefore - 5000).toLocaleString("en-IN"));
});

test("confirm rejects a student_id/name mismatch (stale resolution guard)", async () => {
  const { status, data } = await post("/api/ask/confirm", {
    action: "record_payment", student_id: "s1", resolved_name: "Someone Else", resolved_class: "5",
    params: { fee_type: "term", amount: 100 },
  });
  assert.equal(status, 400);
  assert.equal(data.code, "stale_resolution");
});

test("full concession flow: request -> pending approval -> approve -> unlocked", async () => {
  const { data: intent } = await post("/api/ask/interpret", { query: "reopen the term fee concession for Priya Sharma because parent submitted new income proof" });
  const { data: resolved } = await post("/api/ask/resolve", { action: intent.action, target: intent.target, params: intent.params });
  assert.equal(resolved.status, "resolved");
  const student = resolved.candidate;

  const { data: confirmed } = await post("/api/ask/confirm", {
    action: "request_concession_change", student_id: student.id, resolved_name: student.name, resolved_class: student.class,
    params: intent.params,
  });
  assert.equal(confirmed.status, "pending_approval");

  const { data: approvals } = await get("/api/approvals?role=admin_officer");
  const found = approvals.approvals.find((a) => a.id === confirmed.approval_id);
  assert.ok(found, "approval should be listed");
  assert.equal(found.kind, "concession");

  const { data: decision } = await post(`/api/approvals/${confirmed.approval_id}/decision`, { decision: "approve" });
  assert.equal(decision.status, "ok");
  assert.equal(decision.approval.status, "approved");

  const { data: after2 } = await post("/api/ask/resolve", { action: "request_concession_change", target: { student_name: "Priya Sharma" }, params: { bucket: "term" } });
  assert.equal(after2.status, "noop"); // no longer locked, so a repeat request is now a no-op
});

test("request_receipt_cancellation: two active receipts -> disambiguate -> confirm -> approve -> cancelled", async () => {
  const { data: intent } = await post("/api/ask/interpret", { query: "cancel the receipt for Ravi Kumar in class 5" });
  const { data: resolved } = await post("/api/ask/resolve", { action: intent.action, target: intent.target, params: intent.params });
  assert.equal(resolved.status, "disambiguate");
  assert.equal(resolved.level, "receipt");
  assert.equal(resolved.candidates.length, 2);

  const receipt = resolved.candidates[0];
  const { data: confirmed } = await post("/api/ask/confirm", {
    action: "request_receipt_cancellation",
    student_id: resolved.student.id, resolved_name: resolved.student.name, resolved_class: resolved.student.class,
    receipt_no: receipt.receipt_no, params: { reason: "duplicate entry" },
  });
  assert.equal(confirmed.status, "pending_approval");

  await post(`/api/approvals/${confirmed.approval_id}/decision`, { decision: "approve" });
  const { data: again } = await post("/api/ask/resolve", { action: "request_receipt_cancellation", target: { student_name: "Ravi Kumar", class: "5" }, params: {} });
  // Only one active receipt left now, so this resolves straight through instead of disambiguating.
  assert.equal(again.status, "resolved");
  assert.notEqual(again.receipt.receipt_no, receipt.receipt_no);
});

test("change_transport_route rejects a student not on transport", async () => {
  const { data } = await post("/api/ask/resolve", { action: "change_transport_route", target: { student_name: "Priya Sharma" }, params: { route: "North Route" } });
  assert.equal(data.status, "rejected");
});

test("create_support_ticket: resolves with no student, confirm persists the ticket", async () => {
  const { data: intent } = await post("/api/ask/interpret", { query: "raise a ticket, the print button doesn't respond on the Fee Receipts page" });
  assert.equal(intent.action, "create_support_ticket");
  const { data: confirmed } = await post("/api/ask/confirm", { action: "create_support_ticket", params: intent.params });
  assert.equal(confirmed.status, "created");
  assert.ok(confirmed.ticket_id);
});

test("update_status requires Principal approval before it takes effect", async () => {
  const { data: resolved } = await post("/api/ask/resolve", { action: "update_status", target: { student_name: "Karthik Rao" }, params: { status: "Graduated" } });
  assert.equal(resolved.status, "resolved");
  const student = resolved.candidate;

  const { data: confirmed } = await post("/api/ask/confirm", {
    action: "update_status", student_id: student.id, resolved_name: student.name, resolved_class: student.class,
    params: { status: "Graduated" },
  });
  assert.equal(confirmed.status, "pending_approval");

  const { data: approvals } = await get("/api/approvals?role=principal");
  const found = approvals.approvals.find((a) => a.id === confirmed.approval_id);
  assert.ok(found);

  await post(`/api/approvals/${confirmed.approval_id}/decision`, { decision: "approve" });
  const { data: search } = await post("/api/ask/resolve", { action: "search", entity: "students", filters: { name: "Karthik Rao" } });
  assert.equal(search.rows[0][4], "Graduated");
});
