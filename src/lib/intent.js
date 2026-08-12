"use strict";

const { tokenize, fuzzyTokenEq, fuzzyAny, nearestMatch } = require("./fuzzy");
const { FEE_TYPE_LABEL } = require("../data/seed");

/**
 * Tier 1 - Intent Parser (see docs/Ask_the_ERP_Developer_Spec.pdf, section 3.2/4).
 *
 * Classifies a raw query into one of the 9 actions and extracts slots. Verb/
 * keyword detection and closed-vocabulary slot values (student/staff name,
 * branch, ticket page, bus route) both go through the Tier 2 fuzzy matcher in
 * fuzzy.js, so typos resolve the same way whether they're in a verb ("cancle")
 * or an entity name ("Ravi Kumr"). `candidates` supplies the live vocab to
 * match against, so this module has no direct dependency on the data store and
 * stays unit-testable with a fixed fixture (see test/intent.test.js).
 *
 * Every gated branch below falls through to the next check instead of hard-
 * returning `understood:false` when a required slot is missing. This matters:
 * an early false-positive keyword match (e.g. "report" fuzzy-matching "record")
 * must never block a correct match further down the cascade - see the worked
 * example in the spec, section 3.3.
 */

function findAmount(q) {
  const m = q.match(/(\d[\d,]{2,})/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

function findFeeType(q) {
  const tokens = tokenize(q);
  for (const k of Object.keys(FEE_TYPE_LABEL)) {
    if (fuzzyAny(tokens, [k]) || (k === "term" && fuzzyAny(tokens, ["tuition"]))) return k;
  }
  return null;
}

function findName(q, names) {
  return nearestMatch(q, [...new Set(names)]);
}

function findClass(rawQuery) {
  const tokens = tokenize(rawQuery);
  const idx = tokens.findIndex((t) => fuzzyTokenEq(t, "class") || fuzzyTokenEq(t, "grade"));
  if (idx === -1 || idx + 1 >= tokens.length) return null;
  const next = tokens[idx + 1];
  if (/^\d{1,2}$/.test(next)) return next;
  if (["lkg", "ukg", "nursery"].includes(next)) return next.toUpperCase();
  return null;
}

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function findBranch(q, branches) {
  const squashedQuery = squash(q);
  const squashHit = branches.find((b) => squashedQuery.includes(squash(b)));
  return squashHit || nearestMatch(q, branches);
}

function findConcessionBucket(q) {
  const tokens = tokenize(q);
  if (fuzzyAny(tokens, ["transport"])) return "transport";
  if (fuzzyAny(tokens, ["hostel"])) return "hostel";
  if (fuzzyAny(tokens, ["application"])) return "application";
  if (fuzzyAny(tokens, ["registration"])) return "registration";
  if (fuzzyAny(tokens, ["admission", "adm"])) return "adm";
  if (fuzzyAny(tokens, ["term"])) return "term";
  return null;
}

// Only extracted when the sentence actually states one - never invent a
// reason nobody gave; the caller must show a required, empty reason field
// instead of fabricating a plausible-sounding one.
function findReason(rawQuery) {
  const m = rawQuery.match(/\b(?:because|since|as)\s+(.+)$/i);
  return m ? m[1].trim().replace(/[.?!]+$/, "") : null;
}

function findTicketPage(rawQuery, pages) {
  return nearestMatch(rawQuery, pages);
}

function findTicketType(q) {
  const tokens = tokenize(q);
  if (/\bbug\b|doesn't respond|doesn't work|freezes|blank screen|resets to zero|won't let/.test(q) || fuzzyAny(tokens, ["bug", "broken", "error"])) return "bug";
  if (/feature request|add a |add an |let us |can we /.test(q) || fuzzyAny(tokens, ["feature"])) return "feature";
  if (/improvement|too slow|too small|confusing|cramped|takes too long/.test(q) || fuzzyAny(tokens, ["improvement", "slow"])) return "improvement";
  return "bug";
}

function findTicketDescription(rawQuery, page) {
  let d = rawQuery;
  d = d.replace(/^(raise a ticket[,:]?\s*(to\s+)?)/i, "");
  d = d.replace(/^(report a bug[,:]?\s*)/i, "");
  d = d.replace(/^(file a (ticket|feature request)[,:]?\s*)/i, "");
  d = d.replace(/^(feature request( for [a-z\s]+)?[,:]?\s*)/i, "");
  d = d.replace(/^(improvement idea( for [a-z\s]+)?[,:]?\s*)/i, "");
  d = d.replace(/^there'?s a bug on [a-z\s]+[,-]?\s*/i, "");
  if (page) {
    const escaped = page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    d = d.replace(new RegExp(`[\\s,-]*(on|for|about)?\\s*(the\\s+)?${escaped}\\s*page\\b`, "i"), "");
  }
  d = d.replace(/^[-:\s]+|[-:\s]+$/g, "").trim();
  return d || rawQuery;
}

function findRoute(rawQuery, routes) {
  return nearestMatch(rawQuery, routes);
}

/**
 * @param {string} rawQuery
 * @param {{studentNames:string[], staffNames:string[], branches:string[], ticketPages:string[], busRoutes:string[]}} candidates
 */
function interpret(rawQuery, candidates) {
  const q = String(rawQuery).toLowerCase().trim();
  if (!q || q.length < 4 || !/[a-z]/.test(q)) {
    return { understood: false, raw: rawQuery };
  }
  const tokens = tokenize(rawQuery);
  const { studentNames, staffNames, branches, ticketPages, busRoutes } = candidates;

  const isPaymentVerb = fuzzyAny(tokens, ["record", "pay", "collect", "payment"]);
  const isStatusVerb = fuzzyAny(tokens, ["mark", "set", "change"]) && fuzzyAny(tokens, ["active", "inactive", "graduated"]);

  if (isPaymentVerb) {
    const amount = findAmount(q);
    const feeType = findFeeType(q) || "term";
    const name = findName(q, studentNames);
    if (name && amount) {
      return { understood: true, action: "record_payment", target: { student_name: name, class: findClass(rawQuery) }, params: { fee_type: feeType, amount } };
    }
  }

  if (isStatusVerb) {
    const status = fuzzyAny(tokens, ["inactive"]) ? "Inactive" : fuzzyAny(tokens, ["graduated"]) ? "Graduated" : "Active";
    const name = findName(q, studentNames);
    if (name) {
      return { understood: true, action: "update_status", target: { student_name: name, class: findClass(rawQuery) }, params: { status } };
    }
  }

  const isConcessionVerb = fuzzyAny(tokens, ["reopen", "unlock"]) && fuzzyAny(tokens, ["concession"]);
  if (isConcessionVerb) {
    const bucket = findConcessionBucket(q);
    const name = findName(q, studentNames);
    if (name && bucket) {
      return { understood: true, action: "request_concession_change", target: { student_name: name, class: findClass(rawQuery) }, params: { bucket, reason: findReason(rawQuery) } };
    }
  }

  const isCancelReceiptVerb = fuzzyAny(tokens, ["cancel"]) && fuzzyAny(tokens, ["receipt"]);
  if (isCancelReceiptVerb) {
    const name = findName(q, studentNames);
    if (name) {
      return { understood: true, action: "request_receipt_cancellation", target: { student_name: name, class: findClass(rawQuery) }, params: { reason: findReason(rawQuery) } };
    }
  }

  const isTicketVerb = fuzzyAny(tokens, ["ticket", "feature"]) || (fuzzyAny(tokens, ["report", "file"]) && fuzzyAny(tokens, ["bug"]));
  if (isTicketVerb) {
    const page = findTicketPage(rawQuery, ticketPages);
    const type = findTicketType(q);
    const description = findTicketDescription(rawQuery, page);
    return { understood: true, action: "create_support_ticket", target: {}, params: { type, page: page || "the app", description } };
  }

  const isRouteChangeVerb = fuzzyAny(tokens, ["route"]) && (fuzzyAny(tokens, ["bus", "transport", "move", "reassign"]) || /\bto\b/.test(q));
  if (isRouteChangeVerb) {
    const route = findRoute(rawQuery, busRoutes);
    const name = findName(q, studentNames);
    if (name && route) {
      return { understood: true, action: "change_transport_route", target: { student_name: name, class: findClass(rawQuery) }, params: { route } };
    }
  }

  if (fuzzyAny(tokens, ["pending", "queued"]) && fuzzyAny(tokens, ["approval", "review", "pending"]) && !fuzzyAny(tokens, ["concession", "receipt"])) {
    return { understood: true, action: "search", entity: "pending_approvals", filters: { branch: findBranch(q, branches) } };
  }

  if (fuzzyAny(tokens, ["consolidated"]) || (fuzzyAny(tokens, ["class"]) && fuzzyAny(tokens, ["report", "wise"]))) {
    return { understood: true, action: "search", entity: "class_consolidated_report", filters: { branch: findBranch(q, branches) } };
  }

  if (fuzzyAny(tokens, ["staff", "teacher", "employee"])) {
    const name = findName(q, staffNames);
    const branch = findBranch(q, branches);
    const status = fuzzyAny(tokens, ["inactive"]) ? "Inactive" : fuzzyAny(tokens, ["active"]) ? "Active" : null;
    return { understood: true, action: "search", entity: "staff", filters: { name, branch, status } };
  }

  if (fuzzyAny(tokens, ["expenditure", "expense", "spending"])) {
    const amount = findAmount(q);
    const gt = fuzzyAny(tokens, ["over", "above"]) || /more than|greater than/.test(q);
    const mode = ["cash", "upi", "cheque", "bank transfer"].find((m) => q.includes(m));
    const catMatch = q.match(/for ([a-z\s]+?)(?:\s+(?:over|above|paid|since|$))/);
    return {
      understood: true, action: "search", entity: "expenditure",
      filters: { category: catMatch ? catMatch[1].trim() : null, payment_mode: mode, branch: findBranch(q, branches), amount_gt: gt ? amount : null, amount_lt: !gt && amount ? amount : null },
    };
  }

  if (fuzzyAny(tokens, ["fee", "balance", "unpaid", "paid"])) {
    const name = findName(q, studentNames);
    const cls = findClass(rawQuery);
    const branch = findBranch(q, branches);
    const feeType = findFeeType(q);
    const status = fuzzyAny(tokens, ["unpaid"]) ? "unpaid" : fuzzyAny(tokens, ["partial"]) ? "partial" : fuzzyAny(tokens, ["paid"]) ? "paid" : null;
    const amount = findAmount(q);
    return { understood: true, action: "search", entity: "fee_records", filters: { student_name: name, class: cls, branch, fee_type: feeType, status, amount_gt: fuzzyAny(tokens, ["over", "above"]) ? amount : null } };
  }

  if (fuzzyAny(tokens, ["student"])) {
    const name = findName(q, studentNames);
    const branch = findBranch(q, branches);
    const cls = findClass(rawQuery);
    return { understood: true, action: "search", entity: "students", filters: { name, class: cls, branch } };
  }

  return { understood: false, raw: rawQuery };
}

module.exports = { interpret, findAmount, findFeeType, findName, findClass, findBranch, findConcessionBucket, findReason, findTicketPage, findTicketType, findTicketDescription, findRoute };
