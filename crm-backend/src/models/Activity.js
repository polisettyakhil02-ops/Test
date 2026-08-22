const mongoose = require('mongoose');

const TYPES = ['note', 'call', 'email', 'meeting', 'stage_change', 'comment'];

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, default: 'note' },
    body: { type: String, required: true, trim: true },
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    // A task's comment thread - the one Activity target a developer can
    // read/write, since they have no read access to Deal/Contact directly
    // (see routes/tasks.js, routes/deals.js, routes/contacts.js).
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Activity', activitySchema);
module.exports.TYPES = TYPES;
