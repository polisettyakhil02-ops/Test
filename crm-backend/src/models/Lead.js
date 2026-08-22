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
    // Set by POST /api/leads/quick-parse (the sales "Smart Drop Zone") when
    // the rep uses its suggested fields - raw OpenGraph scrape of the
    // company website, kept so the page doesn't need to be re-scraped just
    // to look at it again.
    enrichment: {
      ogTitle: { type: String, trim: true },
      ogDescription: { type: String, trim: true },
      ogImage: { type: String, trim: true },
      ogSiteName: { type: String, trim: true },
      scrapedAt: { type: Date },
    },
    // A snapshot of the matched src/lib/battleCards.js template at parse
    // time, not a live reference - if the static templates change later,
    // a lead keeps the discovery guide it was actually given.
    battleCard: {
      industry: { type: String, trim: true },
      matchedKeywords: { type: [String], default: [] },
      questions: { type: [String], default: [] },
      talkingPoints: { type: [String], default: [] },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);
module.exports.STAGES = STAGES;
