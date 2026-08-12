"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { interpret } = require("../src/lib/intent");
const seed = require("../src/data/seed");

const candidates = {
  studentNames: seed.seedStudents().map((s) => s.name),
  staffNames: seed.seedStaff().map((s) => s.name),
  branches: seed.BRANCHES,
  ticketPages: seed.TICKET_PAGES,
  busRoutes: seed.BUS_ROUTES,
};

const go = (q) => interpret(q, candidates);

test("search / fee_records with class + status", () => {
  const i = go("students in class 6 with unpaid term fees");
  assert.equal(i.understood, true);
  assert.equal(i.action, "search");
  assert.equal(i.entity, "fee_records");
  assert.equal(i.filters.class, "6");
  assert.equal(i.filters.status, "unpaid");
});

test("search / expenditure with amount_gt + mode", () => {
  const i = go("expenditure over 20000 paid by cash");
  assert.equal(i.action, "search");
  assert.equal(i.entity, "expenditure");
  assert.equal(i.filters.amount_gt, 20000);
  assert.equal(i.filters.payment_mode, "cash");
});

test("record_payment extracts amount, fee type, and student", () => {
  const i = go("record a payment of 5000 term fee for Priya Sharma in class 8");
  assert.equal(i.action, "record_payment");
  assert.equal(i.params.amount, 5000);
  assert.equal(i.params.fee_type, "term");
  assert.equal(i.target.student_name, "Priya Sharma");
  assert.equal(i.target.class, "8");
});

test("update_status extracts the new status", () => {
  const i = go("mark Ravi Kumar as inactive");
  assert.equal(i.action, "update_status");
  assert.equal(i.params.status, "Inactive");
});

test("request_concession_change captures bucket and verbatim reason", () => {
  const i = go("reopen the term fee concession for Priya Sharma because parent submitted new income proof");
  assert.equal(i.action, "request_concession_change");
  assert.equal(i.params.bucket, "term");
  assert.equal(i.params.reason, "parent submitted new income proof");
});

test("request_concession_change reason is null when not stated - never invented", () => {
  const i = go("reopen the term fee concession for Priya Sharma");
  assert.equal(i.action, "request_concession_change");
  assert.equal(i.params.reason, null);
});

test("request_receipt_cancellation", () => {
  const i = go("cancel the receipt for Ravi Kumar");
  assert.equal(i.action, "request_receipt_cancellation");
  assert.equal(i.target.student_name, "Ravi Kumar");
});

test("search / pending_approvals", () => {
  const i = go("what's pending for my approval");
  assert.equal(i.action, "search");
  assert.equal(i.entity, "pending_approvals");
});

test("search / class_consolidated_report with branch", () => {
  const i = go("show the class consolidated report for RC Puram");
  assert.equal(i.action, "search");
  assert.equal(i.entity, "class_consolidated_report");
  assert.equal(i.filters.branch, "RC Puram");
});

test("change_transport_route", () => {
  const i = go("change the bus route for Ravi Kumar to North Route");
  assert.equal(i.action, "change_transport_route");
  assert.equal(i.params.route, "North Route");
});

test("create_support_ticket extracts type, page, and description", () => {
  const i = go("raise a ticket, the print button doesn't respond on the Fee Receipts page");
  assert.equal(i.action, "create_support_ticket");
  assert.equal(i.params.type, "bug");
  assert.equal(i.params.page, "Fee Receipts");
  assert.match(i.params.description, /print button doesn't respond/);
});

test("gibberish is never forced into a guess", () => {
  const i = go("asdkj not a real query");
  assert.equal(i.understood, false);
});

// --- Typo tolerance (see spec section 3.3 / 9) -----------------------------

test("typo: cancle/reciept still resolves to request_receipt_cancellation", () => {
  const i = go("cancle the reciept for Priya Sharma");
  assert.equal(i.action, "request_receipt_cancellation");
});

test("typo: reopn/concesion/becase still resolves to request_concession_change", () => {
  const i = go("reopn the term concesion for Priya Sharma becase parent submited new incom proof");
  assert.equal(i.action, "request_concession_change");
  assert.equal(i.params.bucket, "term");
});

test("typo: consolidatd + Kukatpaly still resolves branch correctly", () => {
  const i = go("show class consolidatd report for Kukatpaly");
  assert.equal(i.action, "search");
  assert.equal(i.entity, "class_consolidated_report");
  assert.equal(i.filters.branch, "Kukatpally");
});

test("regression: a fuzzy name in a search query must not misroute into record_payment", () => {
  // report~record and parent~payment are exactly the collision that used to
  // send this into record_payment and then fail on a missing amount.
  const i = go("feee report for Ravi Kumr");
  assert.equal(i.action, "search");
  assert.equal(i.entity, "fee_records");
  assert.equal(i.filters.student_name, "Ravi Kumar");
});
