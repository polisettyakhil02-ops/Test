const mongoose = require('mongoose');

const ENTITY_TYPES = ['task', 'deal', 'contact'];

const attachmentSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, required: true },
    storageKey: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

attachmentSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model('Attachment', attachmentSchema);
module.exports.ENTITY_TYPES = ENTITY_TYPES;
