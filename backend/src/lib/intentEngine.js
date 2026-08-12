"use strict";

const { interpret: interpretRules } = require("./intent");
const { interpretWithLLM } = require("./llmIntent");

/**
 * Picks the Tier 1 engine: rule-based (default, zero config, zero cost) or
 * LLM-backed (set INTENT_ENGINE=llm and ANTHROPIC_API_KEY - see
 * backend/README.md "LLM-backed parsing"). Any LLM failure - missing key,
 * network error, timeout, malformed response - falls back to the rule-based
 * parser rather than surfacing an error to the user, so a flaky/misconfigured
 * LLM degrades accuracy on hard phrasing rather than breaking the feature.
 */
async function interpret(rawQuery, candidates) {
  if (process.env.INTENT_ENGINE !== "llm") {
    return interpretRules(rawQuery, candidates);
  }

  try {
    return await interpretWithLLM(rawQuery, candidates);
  } catch (err) {
    console.error("[intentEngine] LLM parse failed, falling back to rule-based parser:", err.message);
    return interpretRules(rawQuery, candidates);
  }
}

module.exports = { interpret };
