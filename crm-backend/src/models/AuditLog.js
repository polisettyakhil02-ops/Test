const mongoose = require('mongoose');

const ENTITY_TYPES = ['company', 'contact', 'deal', 'task', 'user', 'rule', 'lead'];

const auditLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, required: true, trim: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Small free-form diff, e.g. { from: 'new', to: 'contacted' } for a
    // stage change - deliberately not a full before/after document snapshot.
    changes: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.ENTITY_TYPES = ENTITY_TYPES;
