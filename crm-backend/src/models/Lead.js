const mongoose = require('mongoose');

// Lead stages are deliberately distinct from Deal.STAGES - a lead lives in a
// pre-sales qualification loop and either dies (disqualified) or graduates
// into a real Deal via POST /api/leads/:id/convert, at which point it stops
// moving through these stages entirely.
const STAGES = ['new', 'contacted', 'qualified', 'nurturing', 'disqualified'];

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Free-text company info - a lead usually predates a real Company record.
    companyName: { type: String, trim: true },
    companyWebsite: { type: String, trim: true },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },
    stage: { type: String, enum: STAGES, default: 'new' },
    source: { type: String, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    archived: { type: Boolean, default: false },
    // Set once by POST /api/leads/:id/convert - a converted lead is archived
    // and never re-enters the stage pipeline.
    convertedToDealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', default: null },
    convertedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);
module.exports.STAGES = STAGES;
