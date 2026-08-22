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
  const [error, setError] = useState(null);

  function loadActivities() {
    api.activities.list({ contactId: id }).then((d) => setActivities(d.activities)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    api.contacts.get(id).then((d) => setContact(d.contact)).catch((err) => setError(err.message));
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
