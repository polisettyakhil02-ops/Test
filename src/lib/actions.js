"use strict";

const store = require("./store");
const { CONCESSION_BUCKET_LABEL } = require("../data/seed");

class ActionError extends Error {
  constructor(message, code = "bad_request") {
    super(message);
    this.code = code;
  }
}

/**
 * Re-validates a client-supplied student_id against the free-text target that
 * was actually resolved, rather than trusting the id blindly. This is the
 * IDOR-style check called out in docs/Ask_the_ERP_Developer_Spec.pdf, section 6:
 * the confirm step is not allowed to execute against an id the server hasn't
 * re-checked itself.
 */
function getStudentOrThrow(studentId, expectedName, expectedClass) {
  const student = store.students.find((s) => s.id === studentId);
  if (!student) throw new ActionError(`No student with id ${studentId}`, "not_found");
  if (expectedName && student.name.toLowerCase() !== String(expectedName).toLowerCase()) {
    throw new ActionError("Resolved student no longer matches the original request", "stale_resolution");
  }
  if (expectedClass && student.class !== expectedClass) {
    throw new ActionError("Resolved student no longer matches the original request", "stale_resolution");
  }
  return student;
}

function createPendingApproval({ kind, student, bucket, receipt, reason, branch, approver_role, detail, data }) {
  const id = store.nextApprovalId();
  store.pendingApprovals.push({
    id, kind, student_id: student ? student.id : null, bucket,
    receipt_no: receipt ? receipt.receipt_no : undefined,
    detail, reason, requested_by: "demo-user", requested_on: new Date().toISOString().slice(0, 10),
    branch, approver_role, status: "pending", data: data || {},
  });
  return id;
}

// ---------------------------------------------------------------------------
// Confirm-time executors. record_payment / create_support_ticket /
// change_transport_route execute immediately (no approval gate, per the
// permission table in the spec, section 7.3). The other three only ever
// create a PendingApproval here - the actual mutation happens in
// applyApproval() when an approver decides on it.
// ---------------------------------------------------------------------------

function recordPayment(payload) {
  const { student_id, resolved_name, resolved_class, params = {} } = payload;
  const student = getStudentOrThrow(student_id, resolved_name, resolved_class);
  const feeType = params.fee_type;
  const amount = Number(params.amount);
  if (!feeType || !Number.isFinite(amount) || amount <= 0) {
    throw new ActionError("fee_type and a positive amount are required", "bad_request");
  }
  const key = `${feeType}_balance`;
  if (!(key in student)) throw new ActionError(`Unknown fee type: ${feeType}`, "bad_request");

  student[key] = Math.max(0, (student[key] || 0) - amount);
  student.paid_total = (student.paid_total || 0) + amount;
  const receiptNo = store.nextReceiptNo();
  store.receipts.push({
    receipt_no: receiptNo, student_id: student.id, date: new Date().toISOString().slice(0, 10),
    amount, fee_types: feeType[0].toUpperCase() + feeType.slice(1) + " Fee", status: "Active",
  });
  store.save();
  return {
    status: "recorded", receipt_no: receiptNo,
    message: `₹${amount.toLocaleString("en-IN")} ${feeType} fee for ${student.name} - Receipt No. ${receiptNo}.`,
  };
}

function updateStatus(payload) {
  const { student_id, resolved_name, resolved_class, params = {} } = payload;
  const student = getStudentOrThrow(student_id, resolved_name, resolved_class);
  const newStatus = params.status;
  if (!["Active", "Inactive", "Graduated"].includes(newStatus)) {
    throw new ActionError("status must be Active, Inactive, or Graduated", "bad_request");
  }
  const approvalId = createPendingApproval({
    kind: "status_change", student, reason: params.reason || null, branch: student.branch,
    approver_role: "principal", detail: `Status change for ${student.name}: ${student.status} -> ${newStatus}`,
    data: { new_status: newStatus },
  });
  store.save();
  return {
    status: "pending_approval", approval_id: approvalId,
    message: `${student.name}'s status change to ${newStatus} is now awaiting Principal approval.`,
  };
}

function requestConcessionChange(payload) {
  const { student_id, resolved_name, resolved_class, params = {} } = payload;
  const student = getStudentOrThrow(student_id, resolved_name, resolved_class);
  const bucket = params.bucket;
  const reason = params.reason;
  if (!reason || !String(reason).trim()) throw new ActionError("A reason is required", "bad_request");
  if (!(student.concession_locked || []).includes(bucket)) {
    throw new ActionError("This concession is not locked - nothing to request", "noop");
  }
  const approvalId = createPendingApproval({
    kind: "concession", student, bucket, reason, branch: student.branch, approver_role: "admin_officer",
    detail: `${CONCESSION_BUCKET_LABEL[bucket] || bucket} concession reopen`,
  });
  store.save();
  return {
    status: "pending_approval", approval_id: approvalId,
    message: `${CONCESSION_BUCKET_LABEL[bucket] || bucket} concession re-open request for ${student.name} is now awaiting the Admin Officer.`,
  };
}

function requestReceiptCancellation(payload) {
  const { student_id, resolved_name, resolved_class, receipt_no, params = {} } = payload;
  const student = getStudentOrThrow(student_id, resolved_name, resolved_class);
  const reason = params.reason;
  if (!reason || !String(reason).trim()) throw new ActionError("A reason is required", "bad_request");
  const receipt = store.receipts.find((r) => r.receipt_no === receipt_no && r.student_id === student.id && r.status === "Active");
  if (!receipt) throw new ActionError("No matching active receipt found for this student", "not_found");
  const approvalId = createPendingApproval({
    kind: "cancellation", student, receipt, reason, branch: student.branch, approver_role: "admin_officer",
    detail: `Cancel receipt ${receipt.receipt_no} (₹${receipt.amount.toLocaleString("en-IN")})`,
  });
  store.save();
  return {
    status: "pending_approval", approval_id: approvalId,
    message: `Receipt ${receipt.receipt_no} for ${student.name} is now awaiting Admin Officer approval.`,
  };
}

function createSupportTicket(payload) {
  const { params = {} } = payload;
  if (!params.description || !String(params.description).trim()) {
    throw new ActionError("A description is required", "bad_request");
  }
  const ticket = {
    id: `tick_${Date.now().toString(36)}`, type: params.type || "bug", page: params.page || "the app",
    description: params.description, created_on: new Date().toISOString(),
  };
  store.tickets.push(ticket);
  store.save();
  // Stub: wire this up to a real email/helpdesk integration in production -
  // see README.md "Wiring up real integrations".
  console.log(`[support-ticket] ${ticket.type} on "${ticket.page}": ${ticket.description}`);
  return { status: "created", ticket_id: ticket.id, message: `Your ${ticket.type} ticket about ${ticket.page} has been sent to the support inbox.` };
}

function changeTransportRoute(payload) {
  const { student_id, resolved_name, resolved_class, params = {} } = payload;
  const student = getStudentOrThrow(student_id, resolved_name, resolved_class);
  if (!student.transport_route) throw new ActionError(`${student.name} isn't currently on transport`, "rejected");
  if (!params.route) throw new ActionError("A route is required", "bad_request");
  student.transport_route = params.route;
  store.save();
  return { status: "updated", message: `${student.name} is now on ${params.route}.` };
}

const EXECUTORS = {
  record_payment: recordPayment,
  update_status: updateStatus,
  request_concession_change: requestConcessionChange,
  request_receipt_cancellation: requestReceiptCancellation,
  create_support_ticket: createSupportTicket,
  change_transport_route: changeTransportRoute,
};

function confirm(action, payload) {
  const executor = EXECUTORS[action];
  if (!executor) throw new ActionError(`Unknown or non-executable action: ${action}`, "bad_request");
  const result = executor(payload);
  store.appendAudit({ event: "confirm", action, payload, result });
  return result;
}

// ---------------------------------------------------------------------------
// Approval decisions - closes the loop opened by update_status /
// request_concession_change / request_receipt_cancellation above. Approving
// applies the change those actions deferred; rejecting just marks it decided.
// ---------------------------------------------------------------------------

function applyApproval(approval) {
  const student = store.students.find((s) => s.id === approval.student_id);
  if (!student) return;
  if (approval.kind === "concession") {
    student.concession_locked = (student.concession_locked || []).filter((b) => b !== approval.bucket);
  } else if (approval.kind === "cancellation") {
    const receipt = store.receipts.find((r) => r.receipt_no === approval.receipt_no);
    if (receipt) receipt.status = "Cancelled";
  } else if (approval.kind === "status_change") {
    if (approval.data && approval.data.new_status) student.status = approval.data.new_status;
  }
}

function decideApproval(id, decision, decidedBy) {
  const approval = store.pendingApprovals.find((a) => a.id === id);
  if (!approval) throw new ActionError("Approval not found", "not_found");
  if (approval.status !== "pending") throw new ActionError(`Approval already ${approval.status}`, "conflict");
  if (decision !== "approve" && decision !== "reject") {
    throw new ActionError("decision must be 'approve' or 'reject'", "bad_request");
  }
  if (decision === "approve") applyApproval(approval);
  approval.status = decision === "approve" ? "approved" : "rejected";
  approval.decided_by = decidedBy || "demo-approver";
  approval.decided_on = new Date().toISOString();
  store.save();
  store.appendAudit({ event: "approval_decision", approval_id: id, decision, decided_by: approval.decided_by });
  return approval;
}

module.exports = { confirm, decideApproval, ActionError };
