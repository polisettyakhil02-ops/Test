const mongoose = require('mongoose');

// task_assigned/deal_stage_changed predate the automation engine (lib/events.js)
// and are kept for any notification still created directly in route code;
// rule-generated notifications (routes/rules.js, lib/events.js) use 'automation'.
const TYPES = ['task_assigned', 'deal_stage_changed', 'automation'];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TYPES, required: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.TYPES = TYPES;
