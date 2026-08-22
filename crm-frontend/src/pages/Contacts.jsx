import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function Contacts() {
  const { user } = useAuth();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', companyId: '' });
  const [showForm, setShowForm] = useState(false);

  function load() {
    api.contacts.list().then((d) => setContacts(d.contacts)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    api.companies.list().then((d) => setCompanies(d.companies)).catch(() => {});
  }, []);

  const companyName = (id) => companies.find((c) => c._id === id)?.name || '—';

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.contacts.create({ ...form, companyId: form.companyId || null });
      setForm({ name: '', email: '', phone: '', companyId: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Contacts</h1>
        {canWrite && (
          <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'New contact'}
          </button>
        )}
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

      <table>
        <thead>
          <tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th></tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c._id}>
              <td><Link to={`/contacts/${c._id}`}>{c.name}</Link></td>
              <td>{companyName(c.companyId)}</td>
              <td>{c.email}</td>
              <td>{c.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
