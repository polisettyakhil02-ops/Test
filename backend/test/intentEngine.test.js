"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { interpret } = require("../src/lib/intentEngine");
const { interpret: interpretRules } = require("../src/lib/intent");
const seed = require("../src/data/seed");

const candidates = {
  studentNames: seed.seedStudents().map((s) => s.name),
  staffNames: seed.seedStaff().map((s) => s.name),
  branches: seed.BRANCHES,
  ticketPages: seed.TICKET_PAGES,
  busRoutes: seed.BUS_ROUTES,
};

test("default (no INTENT_ENGINE set) uses the rule-based parser", async () => {
  delete process.env.INTENT_ENGINE;
  const result = await interpret("fee report for Ravi Kumar", candidates);
  assert.equal(result.action, "search");
  assert.equal(result.entity, "fee_records");
});

test("INTENT_ENGINE=llm without an API key falls back to the rule-based parser instead of throwing", async () => {
  const prevEngine = process.env.INTENT_ENGINE;
  const prevKey = process.env.ANTHROPIC_API_KEY;
  process.env.INTENT_ENGINE = "llm";
  delete process.env.ANTHROPIC_API_KEY; // simulate the common "forgot to set it" case
  try {
    const llmResult = await interpret("fee report for Ravi Kumar", candidates);
    const rulesResult = interpretRules("fee report for Ravi Kumar", candidates);
    assert.deepEqual(llmResult, rulesResult);
  } finally {
    if (prevEngine === undefined) delete process.env.INTENT_ENGINE; else process.env.INTENT_ENGINE = prevEngine;
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevKey;
  }
});
