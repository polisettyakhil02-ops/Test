const mongoose = require('mongoose');

const LINKED_ENTITY_TYPES = ['deal', 'lead', 'none'];

const boardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    linkedEntityType: { type: String, enum: LINKED_ENTITY_TYPES, default: 'none' },
    linkedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Current live canvas state (tldraw's serialized snapshot) - overwritten
    // on every debounced save, not versioned on its own. See BoardVersion
    // for periodic history snapshots.
    sceneData: { type: mongoose.Schema.Types.Mixed, default: null },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastEditedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Board', boardSchema);
module.exports.LINKED_ENTITY_TYPES = LINKED_ENTITY_TYPES;
