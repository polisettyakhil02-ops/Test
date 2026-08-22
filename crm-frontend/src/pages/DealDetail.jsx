import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { StageBadge } from '../components/StageBadge';
import { TaskStatusBadge } from '../components/TaskStatusBadge';

export default function DealDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [deal, setDeal] = useState(null);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [developers, setDevelopers] = useState([]);
  const [note, setNote] = useState('');
  const [taskForm, setTaskForm] = useState({ title: '', assigneeId: '' });
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  function loadActivities() {
    api.activities.list({ dealId: id }).then((d) => setActivities(d.activities)).catch((err) => setError(err.message));
  }

  function loadTasks() {
    api.tasks.list({ dealId: id }).then((d) => setTasks(d.tasks)).catch((err) => setError(err.message));
  }

  function loadAttachments() {
    api.attachments.list('deal', id).then((d) => setAttachments(d.attachments)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    api.deals.get(id).then((d) => setDeal(d.deal)).catch((err) => setError(err.message));
    loadActivities();
    loadTasks();
    loadAttachments();
    if (user.role === 'admin' || user.role === 'sales') {
      api.users.list().then((d) => setDevelopers(d.users.filter((u) => u.role === 'developer'))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.attachments.upload('deal', id, file);
      loadAttachments();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function removeAttachment(attachmentId) {
    try {
      await api.attachments.remove(attachmentId);
      loadAttachments();
    } catch (err) {
      setError(err.message);
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await api.activities.create({ type: 'note', body: note, dealId: id });
      setNote('');
      loadActivities();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    try {
      await api.tasks.create({ ...taskForm, assigneeId: taskForm.assigneeId || null, dealId: id });
      setTaskForm({ title: '', assigneeId: '' });
      loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!deal) return <p>Loading…</p>;

  return (
    <div>
      <p><Link to="/deals">&larr; Pipeline</Link></p>
      <h1>{deal.title}</h1>
      <p><StageBadge stage={deal.stage} /> · ${deal.value.toLocaleString()}</p>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Linked tasks</h2>
        {canWrite && (
          <form onSubmit={handleCreateTask} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 6 }}
              placeholder="New task title…"
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
            />
            <select value={taskForm.assigneeId} onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}>
              <option value="">Unassigned</option>
              {developers.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
            <button type="submit" className="primary">Add task</button>
          </form>
        )}
        {tasks.length === 0 ? <p>No tasks linked yet.</p> : (
          <table>
            <thead><tr><th>Title</th><th>Status</th></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t._id}>
                  <td><Link to={`/tasks/${t._id}`}>{t.title}</Link></td>
                  <td><TaskStatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Attachments</h2>
        <div style={{ marginBottom: '1rem' }}>
          <input type="file" onChange={handleUpload} disabled={uploading} />
          {uploading && <span className="stat-label"> Uploading…</span>}
        </div>
        {attachments.length === 0 ? (
          <p>No attachments yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {attachments.map((a) => (
              <li key={a._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0' }}>
                <button type="button" onClick={() => api.attachments.download(a._id, a.filename)} style={{ flex: 1, textAlign: 'left' }}>
                  {a.filename}
                </button>
                <span className="stat-label">{formatSize(a.size)}</span>
                <button type="button" onClick={() => removeAttachment(a._id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Activity</h2>
        <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 6 }}
            placeholder={`Log a note as ${user.name}…`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" className="primary">Add</button>
        </form>
        {activities.length === 0 ? <p>No activity yet.</p> : (
          <ul className="activity-feed">
            {activities.map((a) => (
              <li key={a._id}><strong>{a.type}</strong> — {a.body}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
