const mongoose = require('mongoose');

// 'internal' for internal builds/tooling, 'campaign' for client-facing brand
// work (e.g. Finale) - purely a label for grouping/filtering, doesn't change
// how a project behaves.
const KINDS = ['internal', 'campaign'];

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    kind: { type: String, enum: KINDS, default: 'internal' },
    // Free-form dump for code snippets and notes that don't belong to any
    // one task - the project-level equivalent of a task's codeSnippets,
    // for things worth keeping around before they're broken into tasks.
    scratchpad: { type: String, default: '' },
    archived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
module.exports.KINDS = KINDS;
