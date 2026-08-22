import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { downloadCsv } from '../lib/csv';

export default function Contacts() {
  const { user } = useAuth();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', companyId: '' });
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState('');

  function load(archived) {
    api.contacts
      .list(archived ? { archived: 'true' } : {})
      .then((d) => setContacts(d.contacts))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load(showArchived);
    api.companies.list().then((d) => setCompanies(d.companies)).catch(() => {});
  }, [showArchived]);

  const companyName = (id) => companies.find((c) => c._id === id)?.name || '—';

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(needle) || (c.email || '').toLowerCase().includes(needle)
    );
  }, [contacts, q]);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.contacts.create({ ...form, companyId: form.companyId || null });
      setForm({ name: '', email: '', phone: '', companyId: '' });
      setShowForm(false);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function archive(id) {
    try {
      await api.contacts.archive(id);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function restore(id) {
    try {
      await api.contacts.restore(id);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  function exportCsv() {
    downloadCsv('contacts.csv', [
      { label: 'Name', value: (c) => c.name },
      { label: 'Company', value: (c) => companyName(c.companyId) },
      { label: 'Email', value: (c) => c.email },
      { label: 'Phone', value: (c) => c.phone },
    ], visible);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Contacts</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={exportCsv}>Export CSV</button>
          {canWrite && (
            <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : 'New contact'}
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
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label>
            Company
            <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              <option value="">—</option>
              {companies.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      <div className="filter-bar">
        <input type="search" placeholder="Filter by name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <table>
        <thead>
          <tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th>{canWrite && <th></th>}</tr>
        </thead>
        <tbody>
          {visible.map((c) => (
            <tr key={c._id} className={c.archived ? 'archived-row' : undefined}>
              <td><Link to={`/contacts/${c._id}`}>{c.name}</Link></td>
              <td>{companyName(c.companyId)}</td>
              <td>{c.email}</td>
              <td>{c.phone}</td>
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
