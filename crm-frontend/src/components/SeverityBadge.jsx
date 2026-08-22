const SEVERITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function SeverityBadge({ severity }) {
  if (!severity) return null;
  return <span className={`badge badge-severity-${severity}`}>{SEVERITY_LABELS[severity] || severity}</span>;
}

export const SEVERITIES = Object.keys(SEVERITY_LABELS);
