import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { downloadCsv } from '../lib/csv';

export default function Companies() {
  const { user } = useAuth();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', industry: '', website: '' });
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState('');

  function load(archived) {
    api.companies
      .list(archived ? { archived: 'true' } : {})
      .then((d) => setCompanies(d.companies))
      .catch((err) => setError(err.message));
  }

  useEffect(() => load(showArchived), [showArchived]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(needle) || (c.industry || '').toLowerCase().includes(needle));
  }, [companies, q]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.companies.create(form);
      setForm({ name: '', industry: '', website: '' });
      setShowForm(false);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function archive(id) {
    try {
      await api.companies.archive(id);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function restore(id) {
    try {
      await api.companies.restore(id);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  function exportCsv() {
    downloadCsv('companies.csv', [
      { label: 'Name', value: (c) => c.name },
      { label: 'Industry', value: (c) => c.industry },
      { label: 'Website', value: (c) => c.website },
    ], visible);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Companies</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={exportCsv}>Export CSV</button>
          {canWrite && (
            <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : 'New company'}
            </button>
          )}
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="form-grid card" style={{ marginBottom: '1rem' }} onSubmit={handleCreate}>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Industry
            <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </label>
          <label>
            Website
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      <div className="filter-bar">
        <input type="search" placeholder="Filter by name or industry…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <table>
        <thead>
          <tr><th>Name</th><th>Industry</th><th>Website</th>{canWrite && <th></th>}</tr>
        </thead>
        <tbody>
          {visible.map((c) => (
            <tr key={c._id} className={c.archived ? 'archived-row' : undefined}>
              <td><Link to={`/companies/${c._id}`}>{c.name}</Link></td>
              <td>{c.industry}</td>
              <td>{c.website}</td>
              {canWrite && (
                <td>
                  {c.archived ? (
                    <button type="button" onClick={() => restore(c._id)}>Restore</button>
                  ) : (
                    <button type="button" onClick={() => archive(c._id)}>Archive</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
