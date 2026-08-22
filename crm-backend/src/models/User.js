const mongoose = require('mongoose');

const ROLES = ['admin', 'sales', 'developer'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, default: true },
    // Private, per-user notes for the Developer Workstation's Scratchpad -
    // distinct from Project.scratchpad (v2 Phase 7), which is a shared,
    // per-project note any teammate can read/edit. This one is nobody's
    // business but the account it belongs to, so it lives on User rather
    // than a shared model.
    scratchpad: { type: String, default: '' },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
