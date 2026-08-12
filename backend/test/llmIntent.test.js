"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapToIntent, buildToolSchema } = require("../src/lib/llmIntent");
const seed = require("../src/data/seed");

const candidates = {
  studentNames: seed.seedStudents().map((s) => s.name),
  staffNames: seed.seedStaff().map((s) => s.name),
  branches: seed.BRANCHES,
  ticketPages: seed.TICKET_PAGES,
  busRoutes: seed.BUS_ROUTES,
};

// These tests exercise the deterministic parts - tool schema shape and the
// flat-LLM-output -> app-intent mapping - with hand-built "what the model
// would have returned" fixtures. No network call, no API key needed, so
// this runs in CI same as everything else. See test/llmIntent.live.test.js
// (skipped unless ANTHROPIC_API_KEY is set) for an actual round trip.

test("buildToolSchema produces a valid-looking Anthropic tool definition", () => {
  const schema = buildToolSchema();
  assert.equal(schema.name, "interpret_query");
  assert.equal(schema.input_schema.type, "object");
  assert.deepEqual(schema.input_schema.required, ["understood"]);
  assert.ok(schema.input_schema.properties.action.enum.includes("record_payment"));
  // Admission-fee concession bucket must be "adm" to match seed data, not "admission".
  assert.ok(schema.input_schema.properties.concession_bucket.enum.includes("adm"));
  assert.ok(!schema.input_schema.properties.concession_bucket.enum.includes("admission"));
});

test("understood:false passes straight through with the raw query attached", () => {
  const result = mapToIntent({ understood: false }, "asdkj not a real query", candidates);
  assert.equal(result.understood, false);
  assert.equal(result.raw, "asdkj not a real query");
});

test("maps a fee_records search, resolving a typo'd name via the shared fuzzy matcher", () => {
  const flat = { understood: true, action: "search", entity: "fee_records", student_name: "Ravi Kumr", fee_status: "unpaid" };
  const result = mapToIntent(flat, "fee report for Ravi Kumr, unpaid", candidates);
  assert.equal(result.action, "search");
  assert.equal(result.entity, "fee_records");
  assert.equal(result.filters.student_name, "Ravi Kumar"); // resolved from the typo, same as the rule-based path
  assert.equal(result.filters.status, "unpaid");
});

test("maps an expenditure search with a threshold direction", () => {
  const flat = { understood: true, action: "search", entity: "expenditure", amount: 20000, amount_direction: "gt", payment_mode: "cash" };
  const result = mapToIntent(flat, "expenditure over 20000 paid by cash", candidates);
  assert.equal(result.filters.amount_gt, 20000);
  assert.equal(result.filters.amount_lt, null);
  assert.equal(result.filters.payment_mode, "cash");
});

test("maps record_payment and requires an amount", () => {
  const flat = { understood: true, action: "record_payment", student_name: "Priya Sharma", class: "8", fee_type: "term", amount: 5000 };
  const result = mapToIntent(flat, "record a payment of 5000 term fee for Priya Sharma in class 8", candidates);
  assert.equal(result.action, "record_payment");
  assert.equal(result.target.student_name, "Priya Sharma");
  assert.equal(result.target.class, "8");
  assert.equal(result.params.amount, 5000);

  const missingAmount = mapToIntent({ ...flat, amount: null }, "record a payment for Priya Sharma", candidates);
  assert.equal(missingAmount.understood, false);
});

test("maps request_concession_change, passing reason through null-safe (never invented)", () => {
  const withReason = mapToIntent(
    { understood: true, action: "request_concession_change", student_name: "Priya Sharma", concession_bucket: "term", reason: "parent submitted new income proof" },
    "reopen the term fee concession for Priya Sharma because parent submitted new income proof", candidates,
  );
  assert.equal(withReason.params.reason, "parent submitted new income proof");

  const withoutReason = mapToIntent(
    { understood: true, action: "request_concession_change", student_name: "Priya Sharma", concession_bucket: "term", reason: null },
    "reopen the term fee concession for Priya Sharma", candidates,
  );
  assert.equal(withoutReason.params.reason, null);
});

test("maps create_support_ticket without needing a student", () => {
  const flat = {
    understood: true, action: "create_support_ticket", ticket_type: "bug",
    ticket_page: "Fee Receipts", ticket_description: "the print button doesn't respond",
  };
  const result = mapToIntent(flat, "raise a ticket, the print button doesn't respond on the Fee Receipts page", candidates);
  assert.equal(result.action, "create_support_ticket");
  assert.equal(result.params.page, "Fee Receipts");
  assert.equal(result.params.description, "the print button doesn't respond");
});

test("maps change_transport_route, resolving a typo'd branch/route via the shared matcher", () => {
  const flat = { understood: true, action: "change_transport_route", student_name: "Ravi Kumar", class: "5", route: "North Route" };
  const result = mapToIntent(flat, "change the bus route for Ravi Kumar to North Route", candidates);
  assert.equal(result.action, "change_transport_route");
  assert.equal(result.params.route, "North Route");
});

test("an unresolvable student name yields understood:false rather than a wrong match", () => {
  const flat = { understood: true, action: "update_status", student_name: "Totally Nobody", new_status: "Inactive" };
  const result = mapToIntent(flat, "mark Totally Nobody as inactive", candidates);
  assert.equal(result.understood, false);
});
