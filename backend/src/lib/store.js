"use strict";

const fs = require("fs");
const path = require("path");
const seed = require("../data/seed");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit.log");

function freshState() {
  return {
    students: seed.seedStudents(),
    receipts: seed.seedReceipts(),
    staff: seed.seedStaff(),
    expenditure: seed.seedExpenditure(),
    pendingApprovals: seed.seedPendingApprovals(),
    tickets: [],
    nextReceiptSeq: 300,
    nextApprovalSeq: 1,
  };
}

/**
 * Deliberately a flat JSON file, not a real database - this is an in-memory
 * store with a save-on-write habit, good enough to survive a restart on a
 * single small deployment. See README.md "Moving to a real database" for what
 * changes when this needs to scale past one process / one disk.
 */
let state = load();

function load() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.students)) return parsed;
    }
  } catch (err) {
    console.error("[store] failed to load persisted state, starting fresh:", err.message);
  }
  return freshState();
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("[store] failed to persist state:", err.message);
  }
}

function appendAudit(entry) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch (err) {
    console.error("[store] failed to write audit log:", err.message);
  }
}

// Test-only escape hatch: run each test against a clean, unpersisted state.
function resetForTests() {
  state = freshState();
}

module.exports = {
  get students() { return state.students; },
  get receipts() { return state.receipts; },
  get staff() { return state.staff; },
  get expenditure() { return state.expenditure; },
  get pendingApprovals() { return state.pendingApprovals; },
  get tickets() { return state.tickets; },

  nextReceiptNo() {
    state.nextReceiptSeq += 1;
    return `RC-2026-${String(state.nextReceiptSeq).padStart(4, "0")}`;
  },
  nextApprovalId() {
    state.nextApprovalSeq += 1;
    return `appr_${String(state.nextApprovalSeq).padStart(4, "0")}`;
  },

  save,
  appendAudit,
  resetForTests,
};
