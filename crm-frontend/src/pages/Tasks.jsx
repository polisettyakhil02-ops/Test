import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TASK_STATUSES, TaskStatusBadge } from '../components/TaskStatusBadge';

export default function Tasks() {
  const { user } = useAuth();
  const canAssign = user.role === 'admin' || user.role === 'sales';
  const [tasks, setTasks] = useState([]);
  const [developers, setDevelopers] = useState([]);
  const [mineOnly, setMineOnly] = useState(user.role === 'developer');
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ title: '', assigneeId: '' });
  const [showForm, setShowForm] = useState(false);

  function load() {
    api.tasks.list(mineOnly ? { mine: 'true' } : {}).then((d) => setTasks(d.tasks)).catch((err) => setError(err.message));
  }

  useEffect(load, [mineOnly]);

  useEffect(() => {
    if (canAssign) {
      api.users.list().then((d) => setDevelopers(d.users.filter((u) => u.role === 'developer'))).catch(() => {});
    }
  }, [canAssign]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      await api.tasks.create({ ...form, assigneeId: form.assigneeId || null });
      setForm({ title: '', assigneeId: '' });
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

  const assigneeName = (t) => developers.find((d) => d._id === t.assigneeId)?.name || (t.assigneeId ? t.assigneeId : 'Unassigned');
  const canEditStatus = (t) => user.role === 'admin' || user.role === 'sales' || String(t.assigneeId) === String(user.id || user._id);

  return (
    <div>
      <div className="page-header">
        <h1>Tasks</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
            Assignee
            <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Unassigned</option>
              {developers.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      <div className="board">
        {TASK_STATUSES.map((status) => (
          <div className="board-column" key={status}>
            <h3>{status} ({tasks.filter((t) => t.status === status).length})</h3>
            {tasks.filter((t) => t.status === status).map((t) => (
              <div className="board-card" key={t._id}>
                <div className="board-card-title">{t.title}</div>
                <div className="stat-label">{assigneeName(t)}</div>
                {canEditStatus(t) && (
                  <select value={t.status} onChange={(e) => setStatus(t._id, e.target.value)}>
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
