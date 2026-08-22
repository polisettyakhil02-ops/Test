import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { StageBadge } from '../components/StageBadge';

export default function RegisterDeal() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [salesUsers, setSalesUsers] = useState([]);
  const [form, setForm] = useState({ companyId: '', title: '', value: '', source: '', expectedCloseDate: '', ownerId: '' });
  const [conflict, setConflict] = useState(null); // { hasConflict, openDeals } once checked
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.companies.list().then((d) => setCompanies(d.companies)).catch(() => {});
    api.users.list().then((d) => setSalesUsers(d.users.filter((u) => u.role !== 'developer'))).catch(() => {});
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setConflict(null); // editing invalidates a prior check
  }

  async function handleCheck(e) {
    e.preventDefault();
    setError(null);
    if (!form.companyId) {
      setError('Pick a company to register this deal against.');
      return;
    }
    setChecking(true);
    try {
      const result = await api.deals.conflicts(form.companyId);
      if (result.hasConflict) {
        setConflict(result);
      } else {
        await createDeal(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  async function createDeal(registeredDespiteConflict) {
    setSubmitting(true);
    setError(null);
    try {
      const { deal } = await api.deals.create({
        title: form.title,
        companyId: form.companyId,
        value: Number(form.value) || 0,
        source: form.source || undefined,
        expectedCloseDate: form.expectedCloseDate || undefined,
        ownerId: form.ownerId || undefined,
        registeredDespiteConflict,
      });
      navigate(`/deals/${deal._id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Register Deal</h1>
      <p className="stat-label" style={{ maxWidth: '60ch', marginTop: '-0.5rem' }}>
        Registering checks the company for open deals already in progress before creating a new one — so two reps
        don't end up chasing the same account.
      </p>
      {error && <div className="error-banner">{error}</div>}

      {!conflict && (
        <form className="form-grid card" onSubmit={handleCheck}>
          <label>
            Company
            <select value={form.companyId} onChange={(e) => update('companyId', e.target.value)} required>
              <option value="">Select a company…</option>
              {companies.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Deal title
            <input value={form.title} onChange={(e) => update('title', e.target.value)} required />
          </label>
          <label>
            Value ($)
            <input type="number" min="0" value={form.value} onChange={(e) => update('value', e.target.value)} />
          </label>
          <label>
            Source
            <input value={form.source} onChange={(e) => update('source', e.target.value)} placeholder="referral, outbound, inbound…" />
          </label>
          <label>
            Expected close date
            <input type="date" value={form.expectedCloseDate} onChange={(e) => update('expectedCloseDate', e.target.value)} />
          </label>
          <label>
            Owner
            <select value={form.ownerId} onChange={(e) => update('ownerId', e.target.value)}>
              <option value="">Me</option>
              {salesUsers.map((u) => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary" disabled={checking || submitting}>
            {checking ? 'Checking for existing activity…' : 'Check & register'}
          </button>
        </form>
      )}

      {conflict && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Already active on this account</h2>
          <p className="stat-label">
            {conflict.openDeals.length} open deal{conflict.openDeals.length > 1 ? 's' : ''} found for this company.
            Registering "{form.title}" anyway will be logged to the new deal's activity trail.
          </p>
          <table>
            <thead><tr><th>Deal</th><th>Stage</th><th>Owner</th><th>Last activity</th></tr></thead>
            <tbody>
              {conflict.openDeals.map((d) => (
                <tr key={d._id}>
                  <td>{d.title}</td>
                  <td><StageBadge stage={d.stage} /></td>
                  <td>{d.owner?.name || '—'}</td>
                  <td>{d.lastActivity ? `${d.lastActivity.type}: ${d.lastActivity.body}` : 'No activity logged'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
            <button type="button" onClick={() => setConflict(null)}>Back and edit</button>
            <button type="button" className="primary" disabled={submitting} onClick={() => createDeal(true)}>
              {submitting ? 'Registering…' : 'Register anyway'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
