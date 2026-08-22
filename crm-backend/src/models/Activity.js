const mongoose = require('mongoose');

const TYPES = ['note', 'call', 'email', 'meeting', 'stage_change'];

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, default: 'note' },
    body: { type: String, required: true, trim: true },
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Activity', activitySchema);
module.exports.TYPES = TYPES;
