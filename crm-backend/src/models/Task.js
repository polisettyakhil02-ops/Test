const mongoose = require('mongoose');

const STATUSES = ['todo', 'in_progress', 'in_review', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const TYPES = ['task', 'bug'];
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
    // machinery as a regular task - only these extra fields are bug-specific,
    // and only meaningful (and shown in the UI) when type === 'bug'.
    type: { type: String, enum: TYPES, default: 'task' },
    severity: { type: String, enum: SEVERITIES },
    stepsToReproduce: { type: String, trim: true },
    expectedBehavior: { type: String, trim: true },
    actualBehavior: { type: String, trim: true },
    environment: { type: String, trim: true },
    // Optional - "found while working on this other task", not a formal dependency.
    relatedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Optional: a task may reference a deal/client, or stand alone as
    // internal work. This is the "loose link" between dev work and the
    // sales pipeline.
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null },
    // Same loose-link idea for pre-sales work (e.g. "research this lead's
    // stack before the first call") - a task references at most one of
    // dealId/leadId, never both, but that's convention, not a schema constraint.
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
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
module.exports.TYPES = TYPES;
module.exports.SEVERITIES = SEVERITIES;
