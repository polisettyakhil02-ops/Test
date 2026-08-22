import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function Companies() {
  const { user } = useAuth();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', industry: '', website: '' });
  const [showForm, setShowForm] = useState(false);

  function load() {
    api.companies.list().then((d) => setCompanies(d.companies)).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.companies.create(form);
      setForm({ name: '', industry: '', website: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Companies</h1>
        {canWrite && (
          <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'New company'}
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

      <table>
        <thead>
          <tr><th>Name</th><th>Industry</th><th>Website</th></tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c._id}>
              <td><Link to={`/companies/${c._id}`}>{c.name}</Link></td>
              <td>{c.industry}</td>
              <td>{c.website}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
