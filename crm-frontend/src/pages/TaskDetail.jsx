import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TASK_STATUSES, TaskStatusBadge } from '../components/TaskStatusBadge';
import { SeverityBadge, SEVERITIES } from '../components/SeverityBadge';

const PRIORITIES = ['low', 'medium', 'high'];

export default function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const userId = user.id || user._id;
  const canAssign = user.role === 'admin' || user.role === 'sales';

  const [task, setTask] = useState(null);
  const [developers, setDevelopers] = useState([]);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState(null);

  const [commentText, setCommentText] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [snippetForm, setSnippetForm] = useState({ label: '', language: 'javascript', code: '' });
  const [uploading, setUploading] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    description: '',
    priority: 'medium',
    dueDate: '',
    severity: 'medium',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: '',
    environment: '',
  });

  const canEditWork = task && (canAssign || String(task.assigneeId) === String(userId));

  function loadTask() {
    return api.tasks
      .get(id)
      .then((d) => {
        setTask(d.task);
        setDetailsForm({
          description: d.task.description || '',
          priority: d.task.priority || 'medium',
          dueDate: d.task.dueDate ? d.task.dueDate.slice(0, 10) : '',
          severity: d.task.severity || 'medium',
          stepsToReproduce: d.task.stepsToReproduce || '',
          expectedBehavior: d.task.expectedBehavior || '',
          actualBehavior: d.task.actualBehavior || '',
          environment: d.task.environment || '',
        });
      })
      .catch((err) => setError(err.message));
  }

  function loadComments() {
    api.activities.list({ taskId: id }).then((d) => setComments(d.activities)).catch((err) => setError(err.message));
  }

  function loadAttachments() {
    api.attachments.list('task', id).then((d) => setAttachments(d.attachments)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadTask();
    loadComments();
    loadAttachments();
    if (canAssign) {
      api.users.list().then((d) => setDevelopers(d.users.filter((u) => u.role === 'developer'))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dealLabel = () => {
    if (task.leadId) return `Lead: ${task.leadId.name}`;
    if (task.projectId) return `Project: ${task.projectId.name}`;
    if (!task.dealId) return 'Internal — no client';
    const company = task.dealId.companyId?.name;
    if (!company || task.dealId.title.toLowerCase().startsWith(company.toLowerCase())) return task.dealId.title;
    return `${company} — ${task.dealId.title}`;
  };

  async function setStatus(status) {
    try {
      await api.tasks.setStatus(id, status);
      loadTask();
    } catch (err) {
      setError(err.message);
    }
  }

  async function reassign(assigneeId) {
    try {
      await api.tasks.update(id, { assigneeId: assigneeId || null });
      loadTask();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveDetails(e) {
    e.preventDefault();
    try {
      const body = {
        title: task.title,
        description: detailsForm.description,
        priority: detailsForm.priority,
        assigneeId: task.assigneeId,
        dealId: task.dealId?._id || task.dealId || null,
        leadId: task.leadId?._id || task.leadId || null,
        projectId: task.projectId?._id || task.projectId || null,
        dueDate: detailsForm.dueDate || null,
      };
      if (task.issueType === 'bug') {
        body.severity = detailsForm.severity;
        body.stepsToReproduce = detailsForm.stepsToReproduce;
        body.expectedBehavior = detailsForm.expectedBehavior;
        body.actualBehavior = detailsForm.actualBehavior;
        body.environment = detailsForm.environment;
      }
      await api.tasks.update(id, body);
      setEditingDetails(false);
      loadTask();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addSubtask(e) {
    e.preventDefault();
    if (!subtaskTitle.trim()) return;
    try {
      await api.tasks.addSubtask(id, subtaskTitle.trim());
      setSubtaskTitle('');
      loadTask();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleSubtask(subtaskId, done) {
    try {
      await api.tasks.updateSubtask(id, subtaskId, { done });
      loadTask();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeSubtask(subtaskId) {
    try {
      await api.tasks.removeSubtask(id, subtaskId);
      loadTask();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addSnippet(e) {
    e.preventDefault();
    if (!snippetForm.code.trim()) return;
    try {
      await api.tasks.addSnippet(id, snippetForm);
      setSnippetForm({ label: '', language: snippetForm.language, code: '' });
      loadTask();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeSnippet(snippetId) {
    try {
      await api.tasks.removeSnippet(id, snippetId);
      loadTask();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      await api.activities.create({ type: 'comment', body: commentText, taskId: id });
      setCommentText('');
      loadComments();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.attachments.upload('task', id, file);
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

  if (error) return <div className="error-banner">{error}</div>;
  if (!task) return <p>Loading…</p>;

  return (
    <div>
      <p><Link to="/tasks">&larr; Tasks</Link></p>
      <h1>{task.title}</h1>
      <p>
        <TaskStatusBadge status={task.status} /> · {task.priority} priority
        {task.issueType === 'bug' && <> · <SeverityBadge severity={task.severity} /></>}
        {task.issueType === 'tech_debt' && <> · <span className="stat-label">Tech debt</span></>}
        {task.dueDate && <> · due {new Date(task.dueDate).toLocaleDateString()}</>}
      </p>
      <p className="stat-label">{dealLabel()}</p>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Details</h2>
          {canAssign && (
            <button type="button" onClick={() => setEditingDetails((s) => !s)}>
              {editingDetails ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>

        {editingDetails ? (
          <form className="form-grid" onSubmit={saveDetails}>
            <label>
              Description
              <textarea
                rows={3}
                value={detailsForm.description}
                onChange={(e) => setDetailsForm({ ...detailsForm, description: e.target.value })}
              />
            </label>
            <label>
              Priority
              <select value={detailsForm.priority} onChange={(e) => setDetailsForm({ ...detailsForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={detailsForm.dueDate} onChange={(e) => setDetailsForm({ ...detailsForm, dueDate: e.target.value })} />
            </label>
            <button type="submit" className="primary">Save</button>
          </form>
        ) : (
          <p>{task.description || 'No description.'}</p>
        )}

        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <label>
            Status
            {canEditWork ? (
              <select value={task.status} onChange={(e) => setStatus(e.target.value)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <TaskStatusBadge status={task.status} />
            )}
          </label>
          <label>
            Assignee
            {canAssign ? (
              <select value={task.assigneeId || ''} onChange={(e) => reassign(e.target.value)}>
                <option value="">Unassigned</option>
                {developers.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            ) : (
              <span>{developers.find((d) => d._id === task.assigneeId)?.name || (task.assigneeId ? task.assigneeId : 'Unassigned')}</span>
            )}
          </label>
        </div>
      </div>

      {task.issueType === 'bug' && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>Bug details</h2>
          {editingDetails ? (
            <div className="form-grid">
              <label>
                Severity
                <select value={detailsForm.severity} onChange={(e) => setDetailsForm({ ...detailsForm, severity: e.target.value })}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Environment
                <input
                  placeholder="e.g. prod / Chrome 128"
                  value={detailsForm.environment}
                  onChange={(e) => setDetailsForm({ ...detailsForm, environment: e.target.value })}
                />
              </label>
              <label>
                Steps to reproduce
                <textarea
                  rows={3}
                  value={detailsForm.stepsToReproduce}
                  onChange={(e) => setDetailsForm({ ...detailsForm, stepsToReproduce: e.target.value })}
                />
              </label>
              <label>
                Expected behavior
                <textarea
                  rows={2}
                  value={detailsForm.expectedBehavior}
                  onChange={(e) => setDetailsForm({ ...detailsForm, expectedBehavior: e.target.value })}
                />
              </label>
              <label>
                Actual behavior
                <textarea
                  rows={2}
                  value={detailsForm.actualBehavior}
                  onChange={(e) => setDetailsForm({ ...detailsForm, actualBehavior: e.target.value })}
                />
              </label>
              <p className="stat-label">Use the "Edit" button on Details above to save these together with the description.</p>
            </div>
          ) : (
            <table>
              <tbody>
                <tr><td className="stat-label">Environment</td><td>{task.environment || '—'}</td></tr>
                <tr><td className="stat-label">Steps to reproduce</td><td>{task.stepsToReproduce || '—'}</td></tr>
                <tr><td className="stat-label">Expected behavior</td><td>{task.expectedBehavior || '—'}</td></tr>
                <tr><td className="stat-label">Actual behavior</td><td>{task.actualBehavior || '—'}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Subtasks</h2>
        {canEditWork && (
          <form onSubmit={addSubtask} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 6 }}
              placeholder="Add a checklist item…"
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
            />
            <button type="submit" className="primary">Add</button>
          </form>
        )}
        {task.subtasks.length === 0 ? (
          <p>No subtasks yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {task.subtasks.map((s) => (
              <li key={s._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0' }}>
                <input
                  type="checkbox"
                  checked={s.done}
                  disabled={!canEditWork}
                  onChange={(e) => toggleSubtask(s._id, e.target.checked)}
                />
                <span style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--color-muted)' : 'inherit' }}>
                  {s.title}
                </span>
                {canEditWork && (
                  <button type="button" onClick={() => removeSubtask(s._id)}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Code snippets</h2>
        {canEditWork && (
          <form onSubmit={addSnippet} style={{ marginBottom: '1rem' }} className="form-grid">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 6 }}
                placeholder="Label (optional)"
                value={snippetForm.label}
                onChange={(e) => setSnippetForm({ ...snippetForm, label: e.target.value })}
              />
              <select value={snippetForm.language} onChange={(e) => setSnippetForm({ ...snippetForm, language: e.target.value })}>
                {['javascript', 'typescript', 'python', 'json', 'bash', 'sql', 'text'].map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
            <textarea
              rows={4}
              style={{ fontFamily: 'var(--font-mono, monospace)' }}
              placeholder="Paste a code fragment or stack trace…"
              value={snippetForm.code}
              onChange={(e) => setSnippetForm({ ...snippetForm, code: e.target.value })}
            />
            <button type="submit" className="primary">Add snippet</button>
          </form>
        )}
        {task.codeSnippets.length === 0 ? (
          <p>No snippets yet.</p>
        ) : (
          task.codeSnippets.map((s) => (
            <div key={s._id} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span className="stat-label">{s.label || 'Untitled'} · {s.language}</span>
                {canEditWork && <button type="button" onClick={() => removeSnippet(s._id)}>Remove</button>}
              </div>
              <pre style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', padding: '0.6rem', borderRadius: 6, overflowX: 'auto', margin: 0 }}>
                <code style={{ fontFamily: 'var(--font-mono)' }}>{s.code}</code>
              </pre>
            </div>
          ))
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
                {(canAssign || String(a.uploadedBy) === String(userId)) && (
                  <button type="button" onClick={() => removeAttachment(a._id)}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Comments</h2>
        <form onSubmit={addComment} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 6 }}
            placeholder={`Comment as ${user.name}…`}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button type="submit" className="primary">Add</button>
        </form>
        {comments.length === 0 ? (
          <p>No comments yet.</p>
        ) : (
          <ul className="activity-feed">
            {comments.map((c) => (
              <li key={c._id}>{c.body}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
