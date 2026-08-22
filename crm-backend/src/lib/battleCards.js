// Static, hand-authored discovery-call guides keyed by industry keyword hits
// in a scraped OpenGraph description. Deliberately not AI/LLM-based - a
// small, predictable rule table a sales manager can read, edit, and trust.
const BATTLE_CARDS = [
  {
    industry: 'saas',
    keywords: ['saas', 'software', 'platform', 'cloud', 'api', 'subscription', 'dashboard'],
    questions: [
      'What tools are you using today to solve this?',
      'How many seats/users would this need to support?',
      'Who owns budget for new software here?',
    ],
    talkingPoints: [
      "Lead with time-to-value and integration ease, not a feature list.",
      "Anchor on ROI/efficiency gains for the buyer's actual role.",
    ],
  },
  {
    industry: 'retail',
    keywords: ['retail', 'store', 'shop', 'ecommerce', 'e-commerce', 'boutique', 'apparel', 'fashion'],
    questions: [
      'How many locations/storefronts do you operate?',
      "What's your current POS or inventory system?",
      'Is this tied to a launch or seasonal peak?',
    ],
    talkingPoints: [
      'Emphasize speed to launch and reliability under peak load.',
      'Reference seasonal cash-flow sensitivity.',
    ],
  },
  {
    industry: 'manufacturing',
    keywords: ['manufacturing', 'factory', 'supply chain', 'logistics', 'industrial', 'production'],
    questions: [
      'What does your current supply chain visibility look like?',
      "Who's the operational owner vs. the budget owner here?",
    ],
    talkingPoints: ['Lead with downtime cost and operational risk reduction.'],
  },
];

// Scores each template by keyword-hit count in the description (case
// insensitive substring match) and returns the highest-scoring one, or null
// if the description is empty or matches nothing. Ties keep the
// first-declared template (stable, deterministic - no randomness to debug).
function matchBattleCard(description) {
  if (!description) return null;
  const text = description.toLowerCase();

  let best = null;
  let bestScore = 0;
  for (const card of BATTLE_CARDS) {
    const matched = card.keywords.filter((keyword) => text.includes(keyword));
    if (matched.length > bestScore) {
      bestScore = matched.length;
      best = {
        industry: card.industry,
        matchedKeywords: matched,
        questions: card.questions,
        talkingPoints: card.talkingPoints,
      };
    }
  }
  return best;
}

module.exports = { BATTLE_CARDS, matchBattleCard };
