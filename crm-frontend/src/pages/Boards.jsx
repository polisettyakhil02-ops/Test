import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function Boards() {
  const [boards, setBoards] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');

  function load() {
    api.boards.list().then((d) => setBoards(d.boards)).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.boards.create({ title: title.trim() });
      setTitle('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Boards</h1>
        <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'New board'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <p className="stat-label" style={{ maxWidth: '65ch', marginTop: '-0.5rem' }}>
        A shared canvas for live drawing, meeting notes, technical architecture sketches, or
        creative briefs and storyboards - anyone editing sees everyone else's changes live.
      </p>

      {showForm && (
        <form className="form-grid card" style={{ marginBottom: '1rem', maxWidth: 420 }} onSubmit={handleCreate}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      {boards.length === 0 ? (
        <p>No boards yet.</p>
      ) : (
        <table>
          <thead><tr><th>Title</th><th>Last edited</th></tr></thead>
          <tbody>
            {boards.map((b) => (
              <tr key={b._id}>
                <td><Link to={`/boards/${b._id}`}>{b.title}</Link></td>
                <td>{b.lastEditedAt ? new Date(b.lastEditedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
