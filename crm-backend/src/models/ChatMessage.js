const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatChannel', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
    attachmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attachment' },
    editedAt: { type: Date },
  },
  { timestamps: true }
);

// History pagination (newest-first, scoped to one channel).
chatMessageSchema.index({ channelId: 1, createdAt: -1 });
// Feeds GET /api/search once chat is added there.
chatMessageSchema.index({ body: 'text' });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
