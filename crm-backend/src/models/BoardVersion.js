const mongoose = require('mongoose');

// A safety-net snapshot trail, not a full revision-history UI - one is
// captured at most every few minutes of active editing (see
// src/realtime/index.js), never on every stroke.
const boardVersionSchema = new mongoose.Schema({
  boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  sceneData: { type: mongoose.Schema.Types.Mixed },
  capturedAt: { type: Date, default: Date.now },
});

boardVersionSchema.index({ boardId: 1, capturedAt: -1 });

module.exports = mongoose.model('BoardVersion', boardVersionSchema);
