"use strict";

const store = require("./store");
const { CONCESSION_BUCKET_LABEL } = require("../data/seed");

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

/**
 * Tier 2 - candidate resolution for write actions (see spec section 7.1).
 * Returns { status: "no_match" | "disambiguate" | "resolved", level?, candidates? }.
 * "resolved" always carries exactly one candidate - callers can execute against it.
 */
function resolveStudentCandidates(name, cls) {
  let matches = store.students.filter((s) => s.name.toLowerCase() === String(name || "").toLowerCase());
  if (cls) matches = matches.filter((s) => s.class === cls);
  return matches;
}

function studentResolutionStatus(name, cls) {
  const candidates = resolveStudentCandidates(name, cls);
  if (candidates.length === 0) return { status: "no_match" };
  if (candidates.length > 1) return { status: "disambiguate", level: "student", candidates };
  return { status: "resolved", level: "student", candidate: candidates[0] };
}

function activeReceiptsFor(studentId) {
  return store.receipts.filter((r) => r.student_id === studentId && r.status === "Active");
}

/**
 * Full two-level resolve for an intent produced by Tier 1. `entity`-less
 * (non-search) actions all resolve a student first; request_receipt_cancellation
 * has a second disambiguation level (which receipt) once the student is fixed.
 */
function resolve(action, target = {}, params = {}) {
  if (action === "create_support_ticket") {
    // No student target - nothing to disambiguate, goes straight to confirm.
    return { status: "resolved", level: "none", candidate: null };
  }

  const studentResult = studentResolutionStatus(target.student_name, target.class);
  if (studentResult.status !== "resolved") return studentResult;

  const student = studentResult.candidate;

  if (action === "request_concession_change") {
    const bucket = params.bucket;
    const locked = (student.concession_locked || []).includes(bucket);
    if (!locked) {
      return {
        status: "noop",
        level: "student",
        candidate: student,
        message: `${CONCESSION_BUCKET_LABEL[bucket] || bucket} concession for ${student.name} isn't locked - it's already editable, no request needed.`,
      };
    }
    return { status: "resolved", level: "student", candidate: student };
  }

  if (action === "request_receipt_cancellation") {
    const receipts = activeReceiptsFor(student.id);
    if (receipts.length === 0) {
      return { status: "no_match", level: "receipt", candidate: student, message: `${student.name} has no active receipts to cancel.` };
    }
    if (receipts.length > 1) {
      return { status: "disambiguate", level: "receipt", student, candidates: receipts };
    }
    return { status: "resolved", level: "receipt", candidate: student, receipt: receipts[0] };
  }

  if (action === "change_transport_route") {
    if (!student.transport_route) {
      return {
        status: "rejected",
        level: "student",
        candidate: student,
        message: `${student.name} isn't currently on transport - route changes only apply to a student already assigned one.`,
      };
    }
    return { status: "resolved", level: "student", candidate: student };
  }

  // record_payment, update_status
  return { status: "resolved", level: "student", candidate: student };
}

// ---------------------------------------------------------------------------
// Search (read-only, no disambiguation - just filter + format for display).
// ---------------------------------------------------------------------------

function runSearch(entity, filters = {}) {
  if (entity === "students") {
    let rows = store.students;
    if (filters.name) rows = rows.filter((r) => r.name.toLowerCase().includes(filters.name.toLowerCase()));
    if (filters.class) rows = rows.filter((r) => r.class === filters.class);
    if (filters.branch) rows = rows.filter((r) => r.branch === filters.branch);
    return { entity, cols: ["Name", "Admission No", "Class", "Branch", "Status"], rows: rows.map((r) => [r.name, r.admission_no, r.class, r.branch, r.status]) };
  }

  if (entity === "fee_records") {
    let rows = store.students;
    if (filters.student_name) rows = rows.filter((r) => r.name.toLowerCase().includes(filters.student_name.toLowerCase()));
    if (filters.class) rows = rows.filter((r) => r.class === filters.class);
    if (filters.branch) rows = rows.filter((r) => r.branch === filters.branch);
    const feeKey = (filters.fee_type || "term") + "_balance";
    if (filters.status === "unpaid") rows = rows.filter((r) => r[feeKey] > 0);
    if (filters.status === "paid") rows = rows.filter((r) => r[feeKey] === 0);
    if (filters.amount_gt) rows = rows.filter((r) => r[feeKey] > filters.amount_gt);
    const label = (filters.fee_type || "Term").replace(/^\w/, (c) => c.toUpperCase());
    return { entity, cols: ["Student", "Class", "Branch", `${label} Balance`], rows: rows.map((r) => [r.name, r.class, r.branch, inr(r[feeKey])]) };
  }

  if (entity === "staff") {
    let rows = store.staff;
    if (filters.name) rows = rows.filter((r) => r.name.toLowerCase().includes(filters.name.toLowerCase()));
    if (filters.branch) rows = rows.filter((r) => r.branch === filters.branch);
    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    return { entity, cols: ["Name", "Role", "Branch", "Status"], rows: rows.map((r) => [r.name, r.role, r.branch, r.status]) };
  }

  if (entity === "expenditure") {
    let rows = store.expenditure;
    if (filters.category) rows = rows.filter((r) => r.category.toLowerCase().includes(filters.category.toLowerCase()));
    if (filters.payment_mode) rows = rows.filter((r) => r.payment_mode.toLowerCase().includes(filters.payment_mode));
    if (filters.branch) rows = rows.filter((r) => r.branch === filters.branch);
    if (filters.amount_gt) rows = rows.filter((r) => r.amount > filters.amount_gt);
    if (filters.amount_lt) rows = rows.filter((r) => r.amount < filters.amount_lt);
    return { entity, cols: ["Category", "Amount", "Mode", "Date"], rows: rows.map((r) => [r.category, inr(r.amount), r.payment_mode, r.date]) };
  }

  if (entity === "pending_approvals") {
    let rows = store.pendingApprovals.filter((r) => r.status === "pending");
    if (filters.branch) rows = rows.filter((r) => r.branch === filters.branch);
    return {
      entity, cols: ["Type", "Student", "Detail", "Reason", "Requested"],
      rows: rows.map((r) => {
        const student = store.students.find((s) => s.id === r.student_id);
        const label = r.kind === "concession" ? "Concession" : r.kind === "cancellation" ? "Cancellation" : "Status Change";
        return [label, student ? student.name : r.student_id, r.detail, r.reason, r.requested_on];
      }),
    };
  }

  if (entity === "class_consolidated_report") {
    const groups = new Map();
    for (const s of store.students) {
      if (filters.branch && s.branch !== filters.branch) continue;
      const key = `${s.branch}::${s.class}`;
      if (!groups.has(key)) groups.set(key, { branch: s.branch, grade: s.class, total_students: 0, paid_fee: 0, balance_fee: 0 });
      const g = groups.get(key);
      g.total_students += 1;
      g.paid_fee += s.paid_total || 0;
      g.balance_fee += (s.term_balance || 0) + (s.admission_balance || 0) + (s.transport_balance || 0) + (s.hostel_balance || 0);
    }
    const rows = [...groups.values()].sort((a, b) => a.branch.localeCompare(b.branch) || a.grade.localeCompare(b.grade));
    return { entity, cols: ["Class", "Students", "Paid", "Balance"], rows: rows.map((r) => [r.grade, r.total_students, inr(r.paid_fee), inr(r.balance_fee)]) };
  }

  return { entity, cols: [], rows: [] };
}

module.exports = { resolve, runSearch, resolveStudentCandidates, activeReceiptsFor };
