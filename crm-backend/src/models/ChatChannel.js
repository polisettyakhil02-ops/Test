const mongoose = require('mongoose');

// 'team' is a single shared channel everyone can see; 'group'/'dm' are
// membership-scoped. All three share one schema/collection/route set
// rather than three different implementations, since a DM is really just
// a 2-person group and a "team" channel is really just "everyone" - the
// frontend just labels them differently.
const TYPES = ['team', 'group', 'dm'];

const chatChannelSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, required: true },
    name: { type: String, trim: true }, // meaningful for team/group only
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

chatChannelSchema.index({ memberIds: 1 });

module.exports = mongoose.model('ChatChannel', chatChannelSchema);
module.exports.TYPES = TYPES;
