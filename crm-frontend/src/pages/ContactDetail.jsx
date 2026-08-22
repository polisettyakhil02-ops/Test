import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function ContactDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [contact, setContact] = useState(null);
  const [activities, setActivities] = useState([]);
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  function loadActivities() {
    api.activities.list({ contactId: id }).then((d) => setActivities(d.activities)).catch((err) => setError(err.message));
  }

  function loadAttachments() {
    api.attachments.list('contact', id).then((d) => setAttachments(d.attachments)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    api.contacts.get(id).then((d) => setContact(d.contact)).catch((err) => setError(err.message));
    loadActivities();
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.attachments.upload('contact', id, file);
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
      await api.activities.create({ type: 'note', body: note, contactId: id });
      setNote('');
      loadActivities();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!contact) return <p>Loading…</p>;

  return (
    <div>
      <p><Link to="/contacts">&larr; Contacts</Link></p>
      <h1>{contact.name}</h1>
      <p className="stat-label">{contact.email} {contact.phone && `· ${contact.phone}`}</p>
      {contact.notes && <p>{contact.notes}</p>}

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
        {activities.length === 0 ? (
          <p>No activity yet.</p>
        ) : (
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
