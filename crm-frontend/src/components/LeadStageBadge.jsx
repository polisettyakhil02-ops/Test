const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  nurturing: 'Nurturing',
  disqualified: 'Disqualified',
};

export function LeadStageBadge({ stage }) {
  return <span className={`badge badge-lead-stage-${stage}`}>{STAGE_LABELS[stage] || stage}</span>;
}

export const LEAD_STAGES = Object.keys(STAGE_LABELS);
