const mongoose = require('mongoose');

// The fixed set of domain events the automation engine can react to. Kept
// small and explicit rather than a free-text event name - every event here
// has a real emitter (see routes/deals.js, routes/tasks.js via lib/events.js).
const EVENT_TYPES = [
  'deal.created',
  'deal.stage_changed',
  'task.created',
  'task.assigned',
  'task.status_changed',
  'lead.created',
  'lead.converted',
];
const ACTION_TYPES = ['notify', 'create_task'];
const CONDITION_OPS = ['equals', 'not_equals'];

const conditionSchema = new mongoose.Schema(
  {
    field: { type: String, required: true, trim: true },
    op: { type: String, enum: CONDITION_OPS, default: 'equals' },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const actionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ACTION_TYPES, required: true },
    // Shape depends on type - see lib/ruleEngine.js:
    //   notify:      { targetField, messageTemplate, linkTemplate }
    //   create_task: { titleTemplate, assigneeField, linkToDeal }
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const ruleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    trigger: {
      event: { type: String, enum: EVENT_TYPES, required: true },
      conditions: { type: [conditionSchema], default: [] },
    },
    actions: { type: [actionSchema], default: [] },
    enabled: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Rule', ruleSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.ACTION_TYPES = ACTION_TYPES;
module.exports.CONDITION_OPS = CONDITION_OPS;
