// Stage probabilities used to turn raw pipeline value into a weighted
// forecast - a deal in "proposal" counts for 75% of its value, not 100%,
// since it hasn't closed yet. Pure, DB-free - unit tested directly.
const STAGE_PROBABILITIES = {
  new: 0.1,
  contacted: 0.25,
  qualified: 0.5,
  proposal: 0.75,
  won: 1,
  lost: 0,
};

function weightedValueForStage(totalValue, stage) {
  const probability = STAGE_PROBABILITIES[stage] ?? 0;
  return Math.round(totalValue * probability);
}

// Sums weighted value across open stages only (excludes won, since that
// revenue is already realized, and lost, whose weight is 0 anyway) - this
// is "how much of the open pipeline do we expect to close", not a revenue total.
function weightedPipelineValue(dealsByStage) {
  return Object.entries(dealsByStage)
    .filter(([stage]) => stage !== 'won' && stage !== 'lost')
    .reduce((sum, [stage, v]) => sum + weightedValueForStage(v.totalValue, stage), 0);
}

module.exports = { STAGE_PROBABILITIES, weightedValueForStage, weightedPipelineValue };
