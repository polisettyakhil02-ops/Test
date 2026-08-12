"use strict";

const { findName, findBranch, findRoute, findTicketPage } = require("./intent");
const { FEE_TYPE_LABEL, CONCESSION_BUCKET_LABEL } = require("../data/seed");

/**
 * LLM-backed Tier 1 (see docs/Ask_the_ERP_Developer_Spec.pdf, section 3.5:
 * "For production accuracy beyond a fixed demo script, replace the keyword
 * cascade with ... an LLM function-calling call against the exact JSON schema").
 *
 * Division of labor is unchanged from the rule-based parser in intent.js:
 * this module's only job is "which of the 9 actions, and what are the raw
 * slot values as the user typed them" - it does NOT try to correct typos or
 * guess the "real" student/branch/route name itself. Those raw strings are
 * run through the exact same Tier 2 fuzzy resolver (fuzzy.js, via the
 * find* helpers imported from intent.js) that the rule-based path already
 * uses, so entity resolution behaves identically either way and every
 * existing resolve.js/actions.js test stays valid regardless of which
 * engine produced the intent.
 *
 * The one place this module is explicitly trusted more than a regex could
 * be is `reason` extraction: the LLM can find "the parent's income dropped
 * after a job change, please reopen it" as a reason even without the literal
 * word "because" the rule-based findReason() requires. The system prompt
 * instructs it to return null rather than invent one - see the "never
 * invent a value" rule below - but this is a real trust boundary, not a
 * guarantee; log and review cases where this matters to you.
 */

const TOOL_NAME = "interpret_query";

function buildToolSchema() {
  return {
    name: TOOL_NAME,
    description: "Extract the structured intent from a single natural-language request to a school ERP system.",
    input_schema: {
      type: "object",
      properties: {
        understood: {
          type: "boolean",
          description: "false if the sentence is gibberish, off-topic, or doesn't map to any of the 9 supported actions. When false, no other field matters.",
        },
        action: {
          type: "string",
          enum: [
            "search", "record_payment", "update_status", "request_concession_change",
            "request_receipt_cancellation", "create_support_ticket", "change_transport_route",
          ],
          description: "Which of the 7 top-level actions this request is.",
        },
        entity: {
          type: "string",
          enum: ["students", "fee_records", "staff", "expenditure", "pending_approvals", "class_consolidated_report"],
          description: "Only set when action is 'search' - which kind of record is being searched for.",
        },
        student_name: {
          type: ["string", "null"],
          description: "The student's name EXACTLY as typed, typos included. Do not correct spelling or guess a 'real' name - a separate step resolves this against actual records.",
        },
        staff_name: {
          type: ["string", "null"],
          description: "A staff/teacher name, exactly as typed, when entity is 'staff'.",
        },
        class: {
          type: ["string", "null"],
          description: "Grade/class, e.g. '6', '10', 'LKG', 'UKG', 'Nursery'. Null if not mentioned.",
        },
        branch: {
          type: ["string", "null"],
          description: "Branch name exactly as typed, typos included (e.g. 'RC Puram', 'Kukatpally').",
        },
        fee_type: {
          type: ["string", "null"],
          enum: [...Object.keys(FEE_TYPE_LABEL), null],
          description: "Which fee type is being asked about or paid.",
        },
        fee_status: {
          type: ["string", "null"],
          enum: ["unpaid", "partial", "paid", null],
          description: "Only for a fee_records search: whether asking for unpaid/partial/paid balances.",
        },
        amount: {
          type: ["number", "null"],
          description: "A monetary amount mentioned in the request (a payment amount, or a threshold for expenditure/fee_records searches).",
        },
        amount_direction: {
          type: ["string", "null"],
          enum: ["gt", "lt", null],
          description: "Only when `amount` is a search threshold: 'gt' for over/above, 'lt' for under/below.",
        },
        expenditure_category: {
          type: ["string", "null"],
          description: "Expenditure category text, only for an expenditure search.",
        },
        payment_mode: {
          type: ["string", "null"],
          enum: ["cash", "upi", "cheque", "bank transfer", null],
          description: "Payment mode, only for an expenditure search.",
        },
        staff_status: {
          type: ["string", "null"],
          enum: ["Active", "Inactive", null],
          description: "Only for a staff search.",
        },
        new_status: {
          type: ["string", "null"],
          enum: ["Active", "Inactive", "Graduated", null],
          description: "Only for update_status: the status the student should be changed to.",
        },
        concession_bucket: {
          type: ["string", "null"],
          // NOTE: this enum intentionally uses "adm" (not "admission") for the
          // admission-fee bucket - it must match the fixed keys the backend's
          // concession_locked data already uses (see src/data/seed.js).
          enum: [...Object.keys(CONCESSION_BUCKET_LABEL), null],
          description: "Which fee-type concession bucket, only for request_concession_change. Use 'adm' for the admission fee bucket, not 'admission'.",
        },
        reason: {
          type: ["string", "null"],
          description: "The reason given for a concession/cancellation/status-change request, in the user's own words. MUST be null if no reason was stated - never invent one.",
        },
        ticket_type: {
          type: ["string", "null"],
          enum: ["bug", "feature", "improvement", null],
          description: "Only for create_support_ticket.",
        },
        ticket_page: {
          type: ["string", "null"],
          description: "The app page/screen the ticket is about, only for create_support_ticket.",
        },
        ticket_description: {
          type: ["string", "null"],
          description: "The actual complaint or request, with the 'raise a ticket about...' framing stripped out - only for create_support_ticket.",
        },
        route: {
          type: ["string", "null"],
          description: "The destination bus route name, only for change_transport_route.",
        },
      },
      required: ["understood"],
    },
  };
}

const SYSTEM_PROMPT = `You turn one sentence from a school ERP office user into a structured request.

There are exactly 9 things a sentence can mean:
1. search students - list/filter student records
2. search fee_records - fee balances/reports for students
3. search staff - list/filter staff
4. search expenditure - list/filter expenditure records
5. search pending_approvals - "what's waiting for my approval"
6. search class_consolidated_report - per-class fee summary
7. record_payment - record a fee payment for a student
8. update_status - change a student's Active/Inactive/Graduated status
9. request_concession_change - ask to reopen a locked fee concession
10. request_receipt_cancellation - ask to cancel a payment receipt
11. create_support_ticket - report a bug/request a feature/suggest an improvement about the app itself
12. change_transport_route - move a student to a different bus route

Call the interpret_query tool exactly once with your answer. Rules:
- If the sentence doesn't clearly mean one of these, or is gibberish/off-topic, set understood to false and leave everything else null.
- Never invent a value that isn't actually in the sentence. This matters most for "reason" - leave it null unless the user actually gave one, and for every name/branch/route/page field - extract it exactly as written (typos included), never "correct" it to what you think the real one is. A separate step resolves fuzzy/misspelled names against real records; your job is only to extract what was said.
- Extract numbers as plain numbers (5000 not "5,000" or "five thousand").
- If a sentence could plausibly mean more than one thing, pick the most specific/literal reading rather than the broadest search.`;

function anthropicApiUrl() {
  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  return `${base.replace(/\/$/, "")}/v1/messages`;
}

/**
 * Calls the Anthropic Messages API with tool_choice forced to interpret_query,
 * so the response is guaranteed (barring an API error) to be the structured
 * object matching buildToolSchema() - no free-text parsing needed.
 */
async function callAnthropic(rawQuery, { apiKey, model, timeoutMs = 8000 } = {}) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(anthropicApiUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [buildToolSchema()],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [{ role: "user", content: rawQuery }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anthropic API returned ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const toolUse = (data.content || []).find((block) => block.type === "tool_use" && block.name === TOOL_NAME);
    if (!toolUse) throw new Error("Anthropic response had no interpret_query tool_use block");
    return toolUse.input;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeClass(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{1,2}$/.test(s)) return s;
  if (["lkg", "ukg", "nursery"].includes(s.toLowerCase())) return s.toUpperCase();
  return null;
}

/**
 * Maps the LLM's flat tool-call output into the exact same
 * {understood, action, entity, target, filters, params} shape intent.js
 * produces, resolving raw name/branch/route/page text through the shared
 * Tier 2 fuzzy matcher along the way.
 */
function mapToIntent(flat, rawQuery, candidates) {
  if (!flat || !flat.understood || !flat.action) return { understood: false, raw: rawQuery };

  const { studentNames, staffNames, branches, ticketPages, busRoutes } = candidates;
  const cls = normalizeClass(flat.class);
  const resolvedStudent = flat.student_name ? findName(flat.student_name, studentNames) : null;
  const resolvedStaff = flat.staff_name ? findName(flat.staff_name, staffNames) : null;
  const resolvedBranch = flat.branch ? findBranch(flat.branch, branches) : null;

  if (flat.action === "search") {
    if (!flat.entity) return { understood: false, raw: rawQuery };

    if (flat.entity === "students") {
      return { understood: true, action: "search", entity: "students", filters: { name: resolvedStudent, class: cls, branch: resolvedBranch } };
    }
    if (flat.entity === "fee_records") {
      return {
        understood: true, action: "search", entity: "fee_records",
        filters: {
          student_name: resolvedStudent, class: cls, branch: resolvedBranch,
          fee_type: flat.fee_type || null, status: flat.fee_status || null,
          amount_gt: flat.amount_direction === "gt" ? flat.amount ?? null : null,
        },
      };
    }
    if (flat.entity === "staff") {
      return { understood: true, action: "search", entity: "staff", filters: { name: resolvedStaff, branch: resolvedBranch, status: flat.staff_status || null } };
    }
    if (flat.entity === "expenditure") {
      return {
        understood: true, action: "search", entity: "expenditure",
        filters: {
          category: flat.expenditure_category || null, payment_mode: flat.payment_mode || null, branch: resolvedBranch,
          amount_gt: flat.amount_direction === "gt" ? flat.amount ?? null : null,
          amount_lt: flat.amount_direction === "lt" ? flat.amount ?? null : null,
        },
      };
    }
    if (flat.entity === "pending_approvals") {
      return { understood: true, action: "search", entity: "pending_approvals", filters: { branch: resolvedBranch } };
    }
    if (flat.entity === "class_consolidated_report") {
      return { understood: true, action: "search", entity: "class_consolidated_report", filters: { branch: resolvedBranch } };
    }
    return { understood: false, raw: rawQuery };
  }

  if (flat.action === "create_support_ticket") {
    return {
      understood: true, action: "create_support_ticket", target: {},
      params: { type: flat.ticket_type || "bug", page: (flat.ticket_page && findTicketPage(flat.ticket_page, ticketPages)) || flat.ticket_page || "the app", description: flat.ticket_description || null },
    };
  }

  // Every remaining action targets a student.
  if (!resolvedStudent) return { understood: false, raw: rawQuery };
  const target = { student_name: resolvedStudent, class: cls };

  if (flat.action === "record_payment") {
    if (flat.amount == null) return { understood: false, raw: rawQuery };
    return { understood: true, action: "record_payment", target, params: { fee_type: flat.fee_type || "term", amount: flat.amount } };
  }
  if (flat.action === "update_status") {
    if (!flat.new_status) return { understood: false, raw: rawQuery };
    return { understood: true, action: "update_status", target, params: { status: flat.new_status } };
  }
  if (flat.action === "request_concession_change") {
    if (!flat.concession_bucket) return { understood: false, raw: rawQuery };
    return { understood: true, action: "request_concession_change", target, params: { bucket: flat.concession_bucket, reason: flat.reason || null } };
  }
  if (flat.action === "request_receipt_cancellation") {
    return { understood: true, action: "request_receipt_cancellation", target, params: { reason: flat.reason || null } };
  }
  if (flat.action === "change_transport_route") {
    const route = flat.route ? findRoute(flat.route, busRoutes) : null;
    if (!route) return { understood: false, raw: rawQuery };
    return { understood: true, action: "change_transport_route", target, params: { route } };
  }

  return { understood: false, raw: rawQuery };
}

async function interpretWithLLM(rawQuery, candidates, options) {
  const flat = await callAnthropic(rawQuery, options);
  return mapToIntent(flat, rawQuery, candidates);
}

module.exports = { interpretWithLLM, mapToIntent, buildToolSchema, SYSTEM_PROMPT, callAnthropic };
