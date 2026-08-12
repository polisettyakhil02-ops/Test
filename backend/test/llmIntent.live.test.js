"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { interpretWithLLM } = require("../src/lib/llmIntent");
const seed = require("../src/data/seed");

const candidates = {
  studentNames: seed.seedStudents().map((s) => s.name),
  staffNames: seed.seedStaff().map((s) => s.name),
  branches: seed.BRANCHES,
  ticketPages: seed.TICKET_PAGES,
  busRoutes: seed.BUS_ROUTES,
};

// Skipped unless a real key is present - these make actual Anthropic API
// calls (network + billing), so they don't run in default `npm test` or in
// CI without ANTHROPIC_API_KEY configured as a secret. Run locally with:
//   ANTHROPIC_API_KEY=sk-ant-... node --test test/llmIntent.live.test.js
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

test("live: a straightforward query round-trips through the real API", { skip: !hasKey }, async () => {
  const result = await interpretWithLLM("record a payment of 5000 term fee for Priya Sharma in class 8", candidates);
  assert.equal(result.understood, true);
  assert.equal(result.action, "record_payment");
  assert.equal(result.target.student_name, "Priya Sharma");
  assert.equal(result.params.amount, 5000);
});

test("live: reason is null when genuinely not stated, not invented", { skip: !hasKey }, async () => {
  const result = await interpretWithLLM("reopen the term fee concession for Priya Sharma", candidates);
  assert.equal(result.action, "request_concession_change");
  assert.equal(result.params.reason, null);
});

test("live: gibberish is not forced into a guess", { skip: !hasKey }, async () => {
  const result = await interpretWithLLM("asdkj not a real query", candidates);
  assert.equal(result.understood, false);
});
