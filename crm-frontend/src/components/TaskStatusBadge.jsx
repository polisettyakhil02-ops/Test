const STATUS_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

export function TaskStatusBadge({ status }) {
  return <span className={`badge badge-task-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export const TASK_STATUSES = Object.keys(STATUS_LABELS);
