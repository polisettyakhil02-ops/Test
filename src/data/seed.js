"use strict";

/**
 * Seed data for the in-memory store. Same fixture used by the interactive
 * design preview, now backing real mutable state instead of a browser-only mock.
 * Swap src/lib/store.js's persistence for a real database without touching
 * this shape - see README.md "Moving to a real database".
 */

const BRANCHES = ["RC Puram", "Kukatpally", "Uppal", "Kondapur"];

const BUS_ROUTES = [
  "North Route", "South Route", "East Route", "West Route",
  "Route 1", "Route 2", "Route 3",
  "Kukatpally Route", "Uppal Route", "Miyapur Route",
];

const TICKET_PAGES = [
  "Fee Receipts", "Make Payment", "Student Search", "Add Payment",
  "Class Consolidated Report", "Bus Routes", "Concessions", "Attendance",
  "Homework", "Fee Structure", "Transfers", "Students", "Ask the ERP",
  "Expenditure", "Staff",
];

const FEE_TYPE_LABEL = {
  term: "term", admission: "admission", transport: "transport",
  hostel: "hostel", registration: "registration", application: "application",
};

const CONCESSION_BUCKET_LABEL = {
  adm: "Admission Fee", term: "Term Fee", transport: "Transport Fee",
  hostel: "Hostel Fee", application: "Application Fee", registration: "Registration Fee",
};

function seedStudents() {
  return [
    { id: "s1", name: "Ravi Kumar", admission_no: "MM2023045", class: "5", branch: "RC Puram", status: "Active", term_balance: 12000, admission_balance: 0, transport_balance: 2000, hostel_balance: 0, concession_locked: [], transport_route: "South Route", paid_total: 0 },
    { id: "s2", name: "Ravi Kumar", admission_no: "MM2024118", class: "8", branch: "Kukatpally", status: "Active", term_balance: 4000, admission_balance: 0, transport_balance: 0, hostel_balance: 0, concession_locked: [], transport_route: "", paid_total: 0 },
    { id: "s3", name: "Priya Sharma", admission_no: "MM2022071", class: "8", branch: "RC Puram", status: "Active", term_balance: 5000, admission_balance: 0, transport_balance: 1500, hostel_balance: 0, concession_locked: ["term"], transport_route: "", paid_total: 0 },
    { id: "s4", name: "Arjun Reddy", admission_no: "MM2021019", class: "6", branch: "RC Puram", status: "Active", term_balance: 12500, admission_balance: 0, transport_balance: 0, hostel_balance: 0, concession_locked: [], transport_route: "East Route", paid_total: 0 },
    { id: "s5", name: "Sneha Reddy", admission_no: "MM2023090", class: "6", branch: "Uppal", status: "Active", term_balance: 9800, admission_balance: 0, transport_balance: 0, hostel_balance: 3000, concession_locked: ["hostel"], transport_route: "", paid_total: 0 },
    { id: "s6", name: "Karthik Rao", admission_no: "MM2020033", class: "10", branch: "RC Puram", status: "Active", term_balance: 0, admission_balance: 0, transport_balance: 0, hostel_balance: 0, concession_locked: [], transport_route: "", paid_total: 0 },
    { id: "s7", name: "Divya Naidu", admission_no: "MM2022104", class: "6", branch: "Kukatpally", status: "Active", term_balance: 15000, admission_balance: 0, transport_balance: 0, hostel_balance: 0, concession_locked: [], transport_route: "Kukatpally Route", paid_total: 0 },
    { id: "s8", name: "Vikram Iyer", admission_no: "MM2021077", class: "9", branch: "RC Puram", status: "Inactive", term_balance: 0, admission_balance: 0, transport_balance: 0, hostel_balance: 0, concession_locked: [], transport_route: "", paid_total: 0 },
  ];
}

function seedReceipts() {
  return [
    { receipt_no: "RC-2026-0142", student_id: "s1", date: "2026-07-02", amount: 12000, fee_types: "Term Fee", status: "Active" },
    { receipt_no: "RC-2026-0198", student_id: "s1", date: "2026-07-20", amount: 2000, fee_types: "Transport Fee", status: "Active" },
    { receipt_no: "RC-2026-0110", student_id: "s2", date: "2026-06-15", amount: 8000, fee_types: "Term Fee", status: "Active" },
    { receipt_no: "RC-2026-0155", student_id: "s3", date: "2026-07-05", amount: 5000, fee_types: "Term Fee", status: "Active" },
    { receipt_no: "RC-2026-0090", student_id: "s4", date: "2026-05-28", amount: 12500, fee_types: "Term Fee", status: "Active" },
    { receipt_no: "RC-2026-0133", student_id: "s5", date: "2026-06-30", amount: 9800, fee_types: "Term Fee", status: "Active" },
  ];
}

function seedStaff() {
  return [
    { id: "t1", name: "Meera Nair", role: "teacher", branch: "RC Puram", status: "Active" },
    { id: "t2", name: "Suresh Iyer", role: "teacher", branch: "Kondapur", status: "Active" },
    { id: "t3", name: "Lakshmi Verma", role: "Admin", branch: "RC Puram", status: "Active" },
    { id: "t4", name: "Kiran Gupta", role: "teacher", branch: "Uppal", status: "Inactive" },
  ];
}

function seedExpenditure() {
  return [
    { id: "e1", category: "Bank Deposits", amount: 25000, payment_mode: "Cash", branch: "RC Puram", date: "2026-08-05" },
    { id: "e2", category: "Salaries and Wages", amount: 180000, payment_mode: "Bank Transfer", branch: "RC Puram", date: "2026-08-01" },
    { id: "e3", category: "Printing and Stationary Bills", amount: 4200, payment_mode: "Cash", branch: "Kukatpally", date: "2026-08-07" },
    { id: "e4", category: "Electricity Bills", amount: 15600, payment_mode: "OnlineTransfer", branch: "Uppal", date: "2026-08-03" },
    { id: "e5", category: "Bus Diesel", amount: 22000, payment_mode: "Cash", branch: "RC Puram", date: "2026-08-08" },
  ];
}

// Seeded with a couple of already-pending items so /api/approvals has
// something to show immediately; real ones accumulate as actions are confirmed.
function seedPendingApprovals() {
  return [
    {
      id: "appr_seed1", kind: "concession", student_id: "s3", bucket: "term",
      detail: "Term Fee concession reopen", reason: "parent submitted updated income proof",
      requested_by: "demo-user", requested_on: "2026-08-10", branch: "RC Puram",
      approver_role: "admin_officer", status: "pending",
    },
    {
      id: "appr_seed2", kind: "cancellation", student_id: "s1", receipt_no: "RC-2026-0142",
      detail: "Cancel receipt RC-2026-0142 (Rs 12,000)", reason: "duplicate entry, payment recorded twice",
      requested_by: "demo-user", requested_on: "2026-08-11", branch: "RC Puram",
      approver_role: "admin_officer", status: "pending",
    },
  ];
}

module.exports = {
  BRANCHES, BUS_ROUTES, TICKET_PAGES, FEE_TYPE_LABEL, CONCESSION_BUCKET_LABEL,
  seedStudents, seedReceipts, seedStaff, seedExpenditure, seedPendingApprovals,
};
