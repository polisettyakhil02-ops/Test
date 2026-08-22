import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DEAL_STAGES } from '../components/StageBadge';

export default function Deals() {
  const { user } = useAuth();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [deals, setDeals] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ title: '', companyId: '', value: '' });
  const [showForm, setShowForm] = useState(false);

  function load() {
    api.deals.list().then((d) => setDeals(d.deals)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    api.companies.list().then((d) => setCompanies(d.companies)).catch(() => {});
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.deals.create({ ...form, companyId: form.companyId || null, value: Number(form.value) || 0 });
      setForm({ title: '', companyId: '', value: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveStage(dealId, stage) {
    try {
      await api.deals.setStage(dealId, stage);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Pipeline</h1>
        {canWrite && (
          <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'New deal'}
          </button>
        )}
      </div>
      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="form-grid card" style={{ marginBottom: '1rem' }} onSubmit={handleCreate}>
          <label>
            Title
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
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
          <label>
            Value ($)
            <input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      <div className="board">
        {DEAL_STAGES.map((stage) => (
          <div className="board-column" key={stage}>
            <h3>{stage} ({deals.filter((d) => d.stage === stage).length})</h3>
            {deals.filter((d) => d.stage === stage).map((d) => (
              <div className="board-card" key={d._id}>
                <div className="board-card-title">
                  <Link to={`/deals/${d._id}`}>{d.title}</Link>
                </div>
                <div>${d.value.toLocaleString()}</div>
                {canWrite && (
                  <select value={d.stage} onChange={(e) => moveStage(d._id, e.target.value)}>
                    {DEAL_STAGES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
