const mongoose = require('mongoose');

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

const dealSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    stage: { type: String, enum: STAGES, default: 'new' },
    value: { type: Number, default: 0, min: 0 },
    source: { type: String, trim: true },
    expectedCloseDate: { type: Date },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Deal', dealSchema);
module.exports.STAGES = STAGES;
