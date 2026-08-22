import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TASK_STATUSES } from '../components/TaskStatusBadge';
import { SeverityBadge, SEVERITIES } from '../components/SeverityBadge';
import { DndBoard } from '../components/DndBoard';

const KIND_LABELS = { internal: 'Internal build', campaign: 'Brand campaign' };
const emptyProjectForm = { name: '', description: '', kind: 'internal' };
const emptyTaskForm = { title: '', assigneeId: '', issueType: 'feature', severity: 'medium', environment: '', stepsToReproduce: '' };

// The "Developer Creative Space": a Project Selector, a cross-project
// Backlog of unassigned bugs (the team's shared triage inbox), and an
// Active Kanban Board scoped to whichever project is selected - plus a
// free-form Scratchpad per project for notes/snippets that don't belong to
// any one task yet.
export default function Projects() {
  const { user } = useAuth();
  const userId = user.id || user._id;
  const canAssign = user.role === 'admin' || user.role === 'sales';

  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [boardTasks, setBoardTasks] = useState([]);
  const [backlog, setBacklog] = useState([]);
  const [developers, setDevelopers] = useState([]);
  const [error, setError] = useState(null);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const [scratchpad, setScratchpad] = useState('');
  const [savingScratchpad, setSavingScratchpad] = useState(false);

  const selected = projects.find((p) => p._id === selectedId) || null;

  function loadProjects() {
    api.projects
      .list()
      .then((d) => {
        setProjects(d.projects);
        setSelectedId((current) => (current && d.projects.some((p) => p._id === current) ? current : d.projects[0]?._id || ''));
      })
      .catch((err) => setError(err.message));
  }

  function loadBacklog() {
    api.tasks.list({ issueType: 'bug', unassigned: 'true' }).then((d) => setBacklog(d.tasks)).catch((err) => setError(err.message));
  }

  function refreshBoard() {
    if (!selectedId) return;
    api.tasks.list({ projectId: selectedId }).then((d) => setBoardTasks(d.tasks)).catch((err) => setError(err.message));
  }

  useEffect(loadProjects, []);
  useEffect(loadBacklog, []);

  useEffect(() => {
    if (canAssign) {
      api.users.list().then((d) => setDevelopers(d.users.filter((u) => u.role === 'developer'))).catch(() => {});
    }
  }, [canAssign]);

  useEffect(refreshBoard, [selectedId]);

  useEffect(() => {
    setScratchpad(selected ? selected.scratchpad || '' : '');
  }, [selectedId, selected?.scratchpad]);

  async function createProject(e) {
    e.preventDefault();
    if (!projectForm.name.trim()) return;
    try {
      const d = await api.projects.create(projectForm);
      setProjectForm(emptyProjectForm);
      setShowProjectForm(false);
      loadProjects();
      setSelectedId(d.project._id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createTask(e) {
    e.preventDefault();
    if (!taskForm.title.trim() || !selectedId) return;
    try {
      const body = { title: taskForm.title, assigneeId: taskForm.assigneeId || null, issueType: taskForm.issueType, projectId: selectedId };
      if (taskForm.issueType === 'bug') {
        body.severity = taskForm.severity;
        body.environment = taskForm.environment;
        body.stepsToReproduce = taskForm.stepsToReproduce;
      }
      await api.tasks.create(body);
      setTaskForm(emptyTaskForm);
      setShowTaskForm(false);
      refreshBoard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function setStatus(taskId, status) {
    try {
      await api.tasks.setStatus(taskId, status);
      refreshBoard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function claimTask(taskId) {
    try {
      await api.tasks.claim(taskId);
      loadBacklog();
      refreshBoard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignBacklogItem(taskId, assigneeId) {
    if (!assigneeId) return;
    try {
      await api.tasks.update(taskId, { assigneeId });
      loadBacklog();
      refreshBoard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveScratchpad() {
    if (!selected) return;
    setSavingScratchpad(true);
    try {
      await api.projects.updateScratchpad(selected._id, scratchpad);
      loadProjects();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingScratchpad(false);
    }
  }

  const canEditStatus = (t) => canAssign || String(t.assigneeId) === String(userId);
  const assigneeName = (t) => developers.find((d) => d._id === t.assigneeId)?.name || 'Unassigned';

  return (
    <div>
      <div className="page-header">
        <h1>Developer Dashboard</h1>
        <button type="button" className="primary" onClick={() => setShowProjectForm((s) => !s)}>
          {showProjectForm ? 'Cancel' : 'New project'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {showProjectForm && (
        <form className="form-grid card" style={{ marginBottom: '1rem' }} onSubmit={createProject}>
          <label>
            Name
            <input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} required />
          </label>
          <label>
            Kind
            <select value={projectForm.kind} onChange={(e) => setProjectForm({ ...projectForm, kind: e.target.value })}>
              <option value="internal">Internal build</option>
              <option value="campaign">Brand campaign</option>
            </select>
          </label>
          <label>
            Description
            <textarea rows={2} value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} />
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      {projects.length === 0 ? (
        <p>No projects yet — create one above to start a Kanban board.</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <label>
              Project
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({KIND_LABELS[p.kind] || p.kind})
                  </option>
                ))}
              </select>
            </label>
            {selected?.description && <p className="stat-label" style={{ marginTop: '0.5rem' }}>{selected.description}</p>}
          </div>

          {selected && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="page-header" style={{ marginBottom: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>Scratchpad</h2>
                <button type="button" className="primary" onClick={saveScratchpad} disabled={savingScratchpad}>
                  {savingScratchpad ? 'Saving…' : 'Save'}
                </button>
              </div>
              <textarea
                rows={6}
                style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', padding: '0.6rem', border: '1px solid var(--color-border)', borderRadius: 6 }}
                placeholder="Dump code snippets, notes, and ideas for this project before they're worth a task…"
                value={scratchpad}
                onChange={(e) => setScratchpad(e.target.value)}
              />
            </div>
          )}
        </>
      )}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Backlog <span className="stat-label">— unassigned bugs, across every project</span></h2>
        {backlog.length === 0 ? (
          <p>Nothing in the backlog — every known bug is assigned.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {backlog.map((t) => (
              <li key={t._id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ flex: 1 }}>
                  <Link to={`/tasks/${t._id}`}>{t.title}</Link>
                  <div className="stat-label">{t.projectId ? t.projectId.name : 'No project'}</div>
                </div>
                <SeverityBadge severity={t.severity} />
                {canAssign ? (
                  <select defaultValue="" onChange={(e) => assignBacklogItem(t._id, e.target.value)}>
                    <option value="" disabled>Assign…</option>
                    {developers.map((d) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <button type="button" onClick={() => claimTask(t._id)}>Claim</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div>
          <div className="page-header">
            <h2>Active board — {selected.name}</h2>
            {canAssign && (
              <button type="button" className="primary" onClick={() => setShowTaskForm((s) => !s)}>
                {showTaskForm ? 'Cancel' : 'New task'}
              </button>
            )}
          </div>

          {showTaskForm && (
            <form className="form-grid card" style={{ marginBottom: '1rem' }} onSubmit={createTask}>
              <label>
                Title
                <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
              </label>
              <label>
                Type
                <select value={taskForm.issueType} onChange={(e) => setTaskForm({ ...taskForm, issueType: e.target.value })}>
                  <option value="feature">Feature</option>
                  <option value="bug">Bug</option>
                  <option value="tech_debt">Tech debt</option>
                </select>
              </label>
              <label>
                Assignee
                <select value={taskForm.assigneeId} onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {developers.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </label>
              {taskForm.issueType === 'bug' && (
                <>
                  <label>
                    Severity
                    <select value={taskForm.severity} onChange={(e) => setTaskForm({ ...taskForm, severity: e.target.value })}>
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Environment
                    <input
                      placeholder="e.g. prod / Chrome 128"
                      value={taskForm.environment}
                      onChange={(e) => setTaskForm({ ...taskForm, environment: e.target.value })}
                    />
                  </label>
                  <label>
                    Steps to reproduce
                    <textarea rows={3} value={taskForm.stepsToReproduce} onChange={(e) => setTaskForm({ ...taskForm, stepsToReproduce: e.target.value })} />
                  </label>
                </>
              )}
              <button type="submit" className="primary">Create</button>
            </form>
          )}

          <DndBoard
            columns={TASK_STATUSES.map((status) => ({ key: status }))}
            items={boardTasks}
            getItemId={(t) => t._id}
            getItemColumn={(t) => t.status}
            onMove={(taskId, status) => setStatus(taskId, status)}
            canDrag={(t) => canEditStatus(t)}
            renderColumnHeader={(col, items) => <h3>{col.key} ({items.length})</h3>}
            renderCard={(t) => (
              <div className="board-card">
                <div className="board-card-title" onPointerDown={(e) => e.stopPropagation()}>
                  <Link to={`/tasks/${t._id}`}>{t.title}</Link>
                </div>
                {t.issueType === 'bug' && (
                  <div style={{ marginBottom: '0.35rem' }}><SeverityBadge severity={t.severity} /></div>
                )}
                {t.issueType === 'tech_debt' && (
                  <div className="stat-label" style={{ marginBottom: '0.35rem' }}>Tech debt</div>
                )}
                <div className="stat-label">{assigneeName(t)}</div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
