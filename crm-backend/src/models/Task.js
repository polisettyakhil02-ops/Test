const mongoose = require('mongoose');

const STATUSES = ['todo', 'in_progress', 'in_review', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: STATUSES, default: 'todo' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Optional: a task may reference a deal/client, or stand alone as
    // internal work. This is the "loose link" between dev work and the
    // sales pipeline.
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null },
    dueDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
