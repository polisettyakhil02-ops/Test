const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

export function StageBadge({ stage }) {
  return <span className={`badge badge-stage-${stage}`}>{STAGE_LABELS[stage] || stage}</span>;
}

export const DEAL_STAGES = Object.keys(STAGE_LABELS);
