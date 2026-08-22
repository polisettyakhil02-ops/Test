import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TASK_STATUSES, TaskStatusBadge } from '../components/TaskStatusBadge';
import { SeverityBadge, SEVERITIES } from '../components/SeverityBadge';
import { DndBoard } from '../components/DndBoard';

const emptyForm = {
  title: '',
  assigneeId: '',
  type: 'task',
  severity: 'medium',
  environment: '',
  stepsToReproduce: '',
};

export default function Tasks() {
  const { user } = useAuth();
  const canAssign = user.role === 'admin' || user.role === 'sales';
  const [tasks, setTasks] = useState([]);
  const [developers, setDevelopers] = useState([]);
  const [mineOnly, setMineOnly] = useState(user.role === 'developer');
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  function load() {
    const params = { ...(mineOnly ? { mine: 'true' } : {}), ...(typeFilter ? { type: typeFilter } : {}) };
    api.tasks.list(params).then((d) => setTasks(d.tasks)).catch((err) => setError(err.message));
  }

  useEffect(load, [mineOnly, typeFilter]);

  useEffect(() => {
    if (canAssign) {
      api.users.list().then((d) => setDevelopers(d.users.filter((u) => u.role === 'developer'))).catch(() => {});
    }
  }, [canAssign]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      const body = { title: form.title, assigneeId: form.assigneeId || null, type: form.type };
      if (form.type === 'bug') {
        body.severity = form.severity;
        body.environment = form.environment;
        body.stepsToReproduce = form.stepsToReproduce;
      }
      await api.tasks.create(body);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function setStatus(taskId, status) {
    try {
      await api.tasks.setStatus(taskId, status);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function reassign(taskId, assigneeId) {
    try {
      await api.tasks.update(taskId, { assigneeId: assigneeId || null });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const assigneeName = (t) => developers.find((d) => d._id === t.assigneeId)?.name || (t.assigneeId ? t.assigneeId : 'Unassigned');
  const canEditStatus = (t) => user.role === 'admin' || user.role === 'sales' || String(t.assigneeId) === String(user.id || user._id);
  const dealLabel = (t) => {
    if (t.leadId) return `Lead: ${t.leadId.name}`;
    if (!t.dealId) return 'Internal — no client';
    const company = t.dealId.companyId?.name;
    if (!company || t.dealId.title.toLowerCase().startsWith(company.toLowerCase())) return t.dealId.title;
    return `${company} — ${t.dealId.title}`;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Tasks</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All work</option>
            <option value="task">Tasks</option>
            <option value="bug">Bugs</option>
          </select>
          {user.role !== 'developer' && (
            <label style={{ fontSize: '0.85rem' }}>
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My tasks only
            </label>
          )}
          {canAssign && (
            <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : 'New task'}
            </button>
          )}
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="form-grid card" style={{ marginBottom: '1rem' }} onSubmit={handleCreate}>
          <label>
            Title
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="task">Task</option>
              <option value="bug">Bug</option>
            </select>
          </label>
          <label>
            Assignee
            <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Unassigned</option>
              {developers.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </label>
          {form.type === 'bug' && (
            <>
              <label>
                Severity
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Environment
                <input
                  placeholder="e.g. prod / Chrome 128"
                  value={form.environment}
                  onChange={(e) => setForm({ ...form, environment: e.target.value })}
                />
              </label>
              <label>
                Steps to reproduce
                <textarea
                  rows={3}
                  value={form.stepsToReproduce}
                  onChange={(e) => setForm({ ...form, stepsToReproduce: e.target.value })}
                />
              </label>
            </>
          )}
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      <DndBoard
        columns={TASK_STATUSES.map((status) => ({ key: status }))}
        items={tasks}
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
            {t.type === 'bug' && (
              <div style={{ marginBottom: '0.35rem' }}><SeverityBadge severity={t.severity} /></div>
            )}
            <div className="stat-label" style={{ marginBottom: '0.35rem' }}>{dealLabel(t)}</div>
            {canAssign ? (
              <select
                value={t.assigneeId || ''}
                onChange={(e) => reassign(t._id, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ marginBottom: '0.4rem' }}
              >
                <option value="">Unassigned</option>
                {developers.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            ) : (
              <div className="stat-label">{assigneeName(t)}</div>
            )}
            {canEditStatus(t) && (
              <select value={t.status} onChange={(e) => setStatus(t._id, e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        )}
      />
    </div>
  );
}
