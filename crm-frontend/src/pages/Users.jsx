import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'sales' });
  const [showForm, setShowForm] = useState(false);

  function load() {
    api.users.list().then((d) => setUsers(d.users)).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.users.create(form);
      setForm({ name: '', email: '', password: '', role: 'sales' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(u) {
    try {
      await api.users.update(u._id, { active: !u.active });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
        <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'New user'}
        </button>
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
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="admin">admin</option>
              <option value="sales">sales</option>
              <option value="developer">developer</option>
            </select>
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u._id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.active ? 'Yes' : 'No'}</td>
              <td>
                <button type="button" onClick={() => toggleActive(u)}>
                  {u.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
