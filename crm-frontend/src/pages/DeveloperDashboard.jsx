import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { gitBranchName, parseStackTrace } from '../lib/textUtils';
import './DeveloperDashboard.css';

const SCRATCHPAD_SAVE_DELAY_MS = 800;
const STATUS_LABELS = { todo: 'To do', in_progress: 'In progress', in_review: 'In review', done: 'Done' };
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

function contextLabel(task) {
  if (task.leadId) return `Lead: ${task.leadId.name}`;
  if (task.projectId) return `Project: ${task.projectId.name}`;
  if (task.dealId) {
    const company = task.dealId.companyId?.name;
    if (!company || task.dealId.title.toLowerCase().startsWith(company.toLowerCase())) return task.dealId.title;
    return `${company} — ${task.dealId.title}`;
  }
  return 'Internal — no client';
}

// Best-effort classification of a free-text environment string into one of
// the badge colors the spec asks for (Prod/Staging/Local). The field itself
// stays free text on the model (e.g. "iOS 17, production") - a hard enum
// would break existing data and lose detail a developer actually wants to
// keep. Anything that doesn't match a known pattern still renders, just
// without a semantic color.
function environmentVariant(envText) {
  const text = (envText || '').toLowerCase();
  if (text.includes('prod')) return 'prod';
  if (text.includes('stag')) return 'staging';
  if (text.includes('local') || text.includes('dev')) return 'local';
  return 'other';
}

// This page defines its own theme-aware badge classes (dw-badge-*) instead
// of reusing the app's global SeverityBadge/TaskStatusBadge components,
// which are styled directly against the shared tokens rather than this
// page's --dw-* aliases - keeping a local set here just means every badge
// on this page can lean on the same --dw-mono/--dw-badge-* vocabulary as
// the rest of the workstation.
function StatusPill({ status }) {
  return <span className={`dw-badge dw-badge-status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

function PriorityPill({ priority }) {
  if (!priority) return null;
  return <span className={`dw-badge dw-badge-level-${priority}`}>{priority}</span>;
}

function SeverityPill({ severity }) {
  if (!severity) return null;
  return <span className={`dw-badge dw-badge-level-${severity}`}>{severity}</span>;
}

function EnvironmentPill({ environment }) {
  if (!environment) return null;
  return <span className={`dw-badge dw-badge-env-${environmentVariant(environment)}`}>{environment}</span>;
}

export default function DeveloperDashboard({ data, onReload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  // ---------- Active Focus hero card ----------
  const [activeTask, setActiveTask] = useState(data.activeTask);
  useEffect(() => setActiveTask(data.activeTask), [data.activeTask]);

  async function toggleSubtask(subtaskId, done) {
    if (!activeTask) return;
    const previous = activeTask;
    setActiveTask((t) => ({ ...t, subtasks: t.subtasks.map((s) => (s._id === subtaskId ? { ...s, done } : s)) }));
    try {
      await api.tasks.updateSubtask(activeTask._id, subtaskId, { done });
    } catch (err) {
      setActiveTask(previous); // optimistic update failed - revert to what the server actually has
      setError(err.message);
    }
  }

  const [copied, setCopied] = useState(false);
  async function copyBranchName() {
    if (!activeTask) return;
    const branch = gitBranchName(activeTask);
    try {
      await navigator.clipboard.writeText(branch);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API can be unavailable (insecure context) or denied - the
      // branch name is already visible, selectable text on the card, so
      // nothing is actually lost, just the one-click convenience.
    }
  }

  // ---------- Scratchpad ----------
  const [scratchpad, setScratchpad] = useState(user.scratchpad || '');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const saveTimer = useRef(null);

  function handleScratchpadChange(value) {
    setScratchpad(value);
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updateScratchpad(value);
        setSaveState('saved');
      } catch (err) {
        setSaveState('idle');
        setError(err.message);
      }
    }, SCRATCHPAD_SAVE_DELAY_MS);
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ---------- Quick error / bug parser ----------
  const [stackTraceInput, setStackTraceInput] = useState('');
  const [creatingBug, setCreatingBug] = useState(false);

  async function createBugFromStackTrace(e) {
    e.preventDefault();
    const { title, description } = parseStackTrace(stackTraceInput);
    if (!title) return;
    setCreatingBug(true);
    try {
      await api.tasks.create({ title, description, issueType: 'bug', severity: 'medium' });
      setStackTraceInput('');
      onReload();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingBug(false);
    }
  }

  // ---------- Cmd+K palette ----------
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [projects, setProjects] = useState([]);
  const [quickForm, setQuickForm] = useState({ title: '', issueType: 'feature' });

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    setPaletteQuery('');
    api.projects.list().then((d) => setProjects(d.projects)).catch(() => {});
  }, [paletteOpen]);

  const filteredProjects = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(paletteQuery.toLowerCase())),
    [projects, paletteQuery]
  );

  function jumpToProject(projectId) {
    setPaletteOpen(false);
    navigate(`/projects?project=${projectId}`);
  }

  async function submitQuickCreate(e) {
    e.preventDefault();
    if (!quickForm.title.trim()) return;
    try {
      await api.tasks.create({ title: quickForm.title.trim(), issueType: quickForm.issueType });
      setQuickForm({ title: '', issueType: 'feature' });
      setPaletteOpen(false);
      onReload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dev-workstation">
      <div className="dw-topbar">
        <div>
          <span className="dw-eyebrow">Developer Workstation</span>
          <h1>Welcome back, {user.name.split(' ')[0]}</h1>
        </div>
        <div className="dw-topbar-actions">
          <button type="button" className="dw-kbd-hint" onClick={() => setPaletteOpen(true)}>
            <kbd>{IS_MAC ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd> Quick actions
          </button>
        </div>
      </div>

      {error && (
        <div className="dw-error" onClick={() => setError(null)}>
          {error} <span className="dw-error-dismiss">✕</span>
        </div>
      )}

      <div className="dw-stat-row">
        <div className="dw-stat-pill">
          <span className="dw-stat-value">{data.openTaskCount}</span>
          <span className="dw-stat-label">Open</span>
        </div>
        <div className="dw-stat-pill">
          <span className="dw-stat-value">{data.overdueTaskCount}</span>
          <span className="dw-stat-label">Overdue</span>
        </div>
        <div className="dw-stat-pill">
          <span className="dw-stat-value">{data.tasksByStatus.done}</span>
          <span className="dw-stat-label">Done</span>
        </div>
      </div>

      <div className="dw-grid">
        <div className="dw-hero-card">
          {activeTask ? (
            <>
              <span className="dw-eyebrow">Active focus</span>
              <h2 className="dw-hero-title">{activeTask.title}</h2>
              <div className="dw-hero-meta">
                <StatusPill status={activeTask.status} />
                <PriorityPill priority={activeTask.priority} />
                {activeTask.issueType === 'bug' && <SeverityPill severity={activeTask.severity} />}
                {activeTask.issueType === 'bug' && <EnvironmentPill environment={activeTask.environment} />}
                <span className="dw-hero-context">{contextLabel(activeTask)}</span>
              </div>

              <div className="dw-branch-row">
                <code className="dw-branch-name">{gitBranchName(activeTask)}</code>
                <button type="button" className="dw-btn dw-btn-primary" onClick={copyBranchName}>
                  {copied ? 'Copied!' : 'Copy git branch'}
                </button>
              </div>

              <div className="dw-subtasks">
                <h3>Subtasks</h3>
                {activeTask.subtasks.length === 0 ? (
                  <p className="dw-dim">No subtasks yet - break this down from the full task view.</p>
                ) : (
                  <ul>
                    {activeTask.subtasks.map((s) => (
                      <li key={s._id}>
                        <label className="dw-subtask-row">
                          <input type="checkbox" checked={s.done} onChange={(e) => toggleSubtask(s._id, e.target.checked)} />
                          <span className={s.done ? 'dw-subtask-done' : ''}>{s.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Link to={`/tasks/${activeTask._id}`} className="dw-open-link">Open full task →</Link>
            </>
          ) : (
            <div className="dw-hero-empty">
              <span className="dw-eyebrow">Active focus</span>
              <p>Nothing in progress right now.</p>
              <Link to="/tasks" className="dw-btn dw-btn-primary">Pick up a task</Link>
            </div>
          )}
        </div>

        <div className="dw-side-col">
          <div className="dw-card dw-scratch-card">
            <div className="dw-card-head">
              <h3>Scratchpad</h3>
              <span className="dw-save-indicator">
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
              </span>
            </div>
            <textarea
              className="dw-scratch-textarea"
              value={scratchpad}
              onChange={(e) => handleScratchpadChange(e.target.value)}
              placeholder={'# Notes\n\nMarkdown, code, half-formed ideas… autosaves as you type.'}
              spellCheck={false}
            />
          </div>

          <div className="dw-card dw-bugparser-card">
            <h3>Paste an error</h3>
            <p className="dw-dim">First line becomes the title, the rest becomes the description. Creates a bug, assigned to you.</p>
            <form onSubmit={createBugFromStackTrace}>
              <textarea
                className="dw-stacktrace-textarea"
                value={stackTraceInput}
                onChange={(e) => setStackTraceInput(e.target.value)}
                placeholder={'TypeError: Cannot read properties of undefined (reading \'map\')\n  at ProjectList (ProjectList.jsx:42:11)'}
                spellCheck={false}
              />
              <button type="submit" className="dw-btn dw-btn-primary" disabled={creatingBug || !stackTraceInput.trim()}>
                {creatingBug ? 'Creating…' : 'Create bug task'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="dw-card dw-task-list-card">
        <h3>My tasks</h3>
        {data.tasks.length === 0 ? (
          <p className="dw-dim">Nothing assigned to you yet.</p>
        ) : (
          <ul className="dw-task-list">
            {data.tasks.map((t) => {
              const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done';
              return (
                <li key={t._id}>
                  <Link to={`/tasks/${t._id}`} className="dw-task-row-title">{t.title}</Link>
                  <StatusPill status={t.status} />
                  <span className={overdue ? 'dw-overdue' : 'dw-dim'}>
                    {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {paletteOpen && (
        <div className="dw-palette-overlay" onClick={() => setPaletteOpen(false)}>
          <div className="dw-palette" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              className="dw-palette-input"
              placeholder="Jump to a project, or quick-create a task…"
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
            />

            <div className="dw-palette-section">
              <div className="dw-palette-section-label">Projects</div>
              {filteredProjects.length === 0 ? (
                <div className="dw-palette-empty">No matching projects.</div>
              ) : (
                filteredProjects.map((p) => (
                  <button key={p._id} type="button" className="dw-palette-item" onClick={() => jumpToProject(p._id)}>
                    <span>{p.name}</span>
                    <span className="dw-palette-item-hint">{p.kind === 'campaign' ? 'Brand campaign' : 'Internal build'}</span>
                  </button>
                ))
              )}
            </div>

            <div className="dw-palette-section">
              <div className="dw-palette-section-label">Quick create</div>
              <form className="dw-palette-quick-form" onSubmit={submitQuickCreate}>
                <input
                  placeholder="Task title…"
                  value={quickForm.title}
                  onChange={(e) => setQuickForm({ ...quickForm, title: e.target.value })}
                />
                <select value={quickForm.issueType} onChange={(e) => setQuickForm({ ...quickForm, issueType: e.target.value })}>
                  <option value="feature">Feature</option>
                  <option value="bug">Bug</option>
                  <option value="tech_debt">Tech debt</option>
                </select>
                <button type="submit" className="dw-btn dw-btn-primary">Create</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
