import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { LeadStageBadge } from '../components/LeadStageBadge';
import { TaskStatusBadge } from '../components/TaskStatusBadge';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [developers, setDevelopers] = useState([]);
  const [note, setNote] = useState('');
  const [taskForm, setTaskForm] = useState({ title: '', assigneeId: '' });
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState(null);

  function loadLead() {
    api.leads.get(id).then((d) => setLead(d.lead)).catch((err) => setError(err.message));
  }

  function loadActivities() {
    api.activities.list({ leadId: id }).then((d) => setActivities(d.activities)).catch((err) => setError(err.message));
  }

  function loadTasks() {
    api.tasks.list({ leadId: id }).then((d) => setTasks(d.tasks)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadLead();
    loadActivities();
    loadTasks();
    if (canWrite) {
      api.users.list().then((d) => setDevelopers(d.users.filter((u) => u.role === 'developer'))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await api.activities.create({ type: 'note', body: note, leadId: id });
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
      await api.tasks.create({ ...taskForm, assigneeId: taskForm.assigneeId || null, leadId: id });
      setTaskForm({ title: '', assigneeId: '' });
      loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConvert() {
    if (!window.confirm(`Convert "${lead.name}" into a deal? This creates/reuses a company and contact record.`)) return;
    setConverting(true);
    setError(null);
    try {
      const { deal } = await api.leads.convert(id);
      navigate(`/deals/${deal._id}`);
    } catch (err) {
      setError(err.message);
      setConverting(false);
    }
  }

  if (error && !lead) return <div className="error-banner">{error}</div>;
  if (!lead) return <p>Loading…</p>;

  return (
    <div>
      <p><Link to="/leads">&larr; Leads</Link></p>
      <h1>{lead.name}</h1>
      <p><LeadStageBadge stage={lead.stage} /> {lead.companyName && <>· {lead.companyName}</>}</p>
      {error && <div className="error-banner">{error}</div>}

      {lead.convertedToDealId ? (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p style={{ margin: 0 }}>
            Converted to a deal on {new Date(lead.convertedAt).toLocaleDateString()} —{' '}
            <Link to={`/deals/${lead.convertedToDealId}`}>view the deal</Link>.
          </p>
        </div>
      ) : (
        canWrite && (
          <div style={{ marginBottom: '1.5rem' }}>
            <button type="button" className="primary" onClick={handleConvert} disabled={converting}>
              {converting ? 'Converting…' : 'Convert to deal'}
            </button>
          </div>
        )
      )}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Details</h2>
        <table>
          <tbody>
            <tr><td className="stat-label">Company website</td><td>{lead.companyWebsite ? <a href={lead.companyWebsite} target="_blank" rel="noreferrer">{lead.companyWebsite}</a> : '—'}</td></tr>
            <tr><td className="stat-label">Contact</td><td>{lead.contactName || '—'}</td></tr>
            <tr><td className="stat-label">Email</td><td>{lead.contactEmail || '—'}</td></tr>
            <tr><td className="stat-label">Phone</td><td>{lead.contactPhone || '—'}</td></tr>
            <tr><td className="stat-label">LinkedIn</td><td>{lead.linkedinUrl ? <a href={lead.linkedinUrl} target="_blank" rel="noreferrer">{lead.linkedinUrl}</a> : '—'}</td></tr>
            <tr><td className="stat-label">Source</td><td>{lead.source || '—'}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Tasks for this lead</h2>
        {canWrite && !lead.convertedToDealId && (
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
