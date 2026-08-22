const mongoose = require('mongoose');

const STATUSES = ['todo', 'in_progress', 'in_review', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
// Was a plain 'task'/'bug' TYPES enum (v2 Phase 2) - widened to a proper
// issue taxonomy once tasks needed to live on a Project board alongside
// tech-debt work, not just features and bugs.
const ISSUE_TYPES = ['feature', 'bug', 'tech_debt'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const subtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Embedded, not a separate collection - a snippet belongs to exactly one
// task and is never queried on its own, same reasoning as subtasks above.
const codeSnippetSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    language: { type: String, trim: true, default: 'text' },
    code: { type: String, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: STATUSES, default: 'todo' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    // 'bug' keeps the same board/status/assignee/subtask/attachment/comment
    // machinery as any other task - only these extra fields are bug-specific,
    // and only meaningful (and shown in the UI) when issueType === 'bug'.
    issueType: { type: String, enum: ISSUE_TYPES, default: 'feature' },
    severity: { type: String, enum: SEVERITIES },
    stepsToReproduce: { type: String, trim: true },
    expectedBehavior: { type: String, trim: true },
    actualBehavior: { type: String, trim: true },
    environment: { type: String, trim: true },
    // Optional - "found while working on this other task", not a formal dependency.
    relatedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Optional: a task may reference a deal/client, a lead, or a project
    // (internal build or brand campaign), or stand alone as ad-hoc work.
    // This is the "loose link" between dev work and the rest of the CRM -
    // a task references at most one of dealId/leadId/projectId by
    // convention, not a schema constraint.
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null },
    // Same loose-link idea for pre-sales work (e.g. "research this lead's
    // stack before the first call").
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    // The developer-workspace equivalent: a task belonging to a Project
    // (e.g. an internal build, or a brand campaign like Finale) rather
    // than a client deal.
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    dueDate: { type: Date },
    subtasks: { type: [subtaskSchema], default: [] },
    codeSnippets: { type: [codeSnippetSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.ISSUE_TYPES = ISSUE_TYPES;
module.exports.SEVERITIES = SEVERITIES;
