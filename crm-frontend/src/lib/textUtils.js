// Small pure text helpers for the Developer Workstation. Kept dependency-
// free and framework-free so they're easy to reason about (and to lift into
// a real test file if this project ever adds a frontend test runner - today
// crm-frontend has none, so these are exercised via the browser instead).

const MAX_SLUG_WORDS = 6;
const MAX_TITLE_LENGTH = 120;

// "Fix login crash on Safari!!" -> "fix-login-crash-on-safari"
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SLUG_WORDS)
    .join('-');
}

// Mongo ObjectIds are 24 hex chars - the last 6 are as good a short,
// glanceable identifier as any of them (there's no separate sequential
// ticket-number scheme in this app).
export function shortTaskId(taskId) {
  const id = String(taskId || '');
  return id.slice(-6) || id;
}

// "feature/<task-id>-<slug>" per spec, for any task - the branch name is a
// pointer back to the task, not a claim about what kind of change it is.
export function gitBranchName(task) {
  if (!task) return '';
  const slug = slugify(task.title) || 'task';
  return `feature/${shortTaskId(task._id)}-${slug}`;
}

// Pasting a stack trace: the first non-empty line is almost always the
// actual error ("TypeError: Cannot read properties of undefined ..."), so
// it becomes the task title; the full paste becomes the description so
// nothing is lost. A title longer than MAX_TITLE_LENGTH is truncated with
// an ellipsis rather than silently cut off mid-word-boundary-unaware.
export function parseStackTrace(rawText) {
  const text = String(rawText || '');
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || '';
  const title = firstLine.length > MAX_TITLE_LENGTH ? `${firstLine.slice(0, MAX_TITLE_LENGTH - 1)}…` : firstLine;
  return { title, description: text.trim() };
}
