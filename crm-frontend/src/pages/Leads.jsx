import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { LEAD_STAGES } from '../components/LeadStageBadge';
import { downloadCsv } from '../lib/csv';
import { DndBoard } from '../components/DndBoard';

export default function Leads() {
  const { user } = useAuth();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [leads, setLeads] = useState([]);
  const [owners, setOwners] = useState([]);
  const [error, setError] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [form, setForm] = useState({ name: '', companyName: '', contactEmail: '' });
  const [showForm, setShowForm] = useState(false);

  function load(archived) {
    const params = archived ? { archived: 'true' } : {};
    api.leads.list(params).then((d) => setLeads(d.leads)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load(showArchived);
    if (canWrite) {
      api.users.list().then((d) => setOwners(d.users)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const ownerName = (id) => owners.find((o) => o._id === id)?.name || '—';

  const visibleLeads = useMemo(() => {
    if (!ownerFilter) return leads;
    return leads.filter((l) => String(l.ownerId) === ownerFilter);
  }, [leads, ownerFilter]);

  async function moveStage(leadId, stage) {
    try {
      await api.leads.setStage(leadId, stage);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function archive(id) {
    try {
      await api.leads.archive(id);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function restore(id) {
    try {
      await api.leads.restore(id);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.leads.create(form);
      setForm({ name: '', companyName: '', contactEmail: '' });
      setShowForm(false);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  function exportCsv() {
    downloadCsv('leads.csv', [
      { label: 'Name', value: (l) => l.name },
      { label: 'Company', value: (l) => l.companyName },
      { label: 'Stage', value: (l) => l.stage },
      { label: 'Owner', value: (l) => ownerName(l.ownerId) },
    ], visibleLeads);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Leads</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={exportCsv}>Export CSV</button>
          {canWrite && (
            <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : 'New lead'}
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
            Company
            <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            />
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      )}

      <div className="filter-bar">
        {canWrite && owners.length > 0 && (
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="">All owners</option>
            {owners.filter((o) => o.role !== 'developer').map((o) => (
              <option key={o._id} value={o._id}>{o.name}</option>
            ))}
          </select>
        )}
        <label>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <DndBoard
        columns={LEAD_STAGES.map((stage) => ({ key: stage }))}
        items={visibleLeads}
        getItemId={(l) => l._id}
        getItemColumn={(l) => l.stage}
        onMove={(leadId, stage) => moveStage(leadId, stage)}
        canDrag={() => canWrite && !showArchived}
        renderColumnHeader={(col, items) => <h3>{col.key} ({items.length})</h3>}
        renderCard={(l) => (
          <div className="board-card">
            <div className="board-card-title" onPointerDown={(e) => e.stopPropagation()}>
              <Link to={`/leads/${l._id}`}>{l.name}</Link>
            </div>
            {l.companyName && <div className="stat-label">{l.companyName}</div>}
            {canWrite && !showArchived && (
              <select value={l.stage} onChange={(e) => moveStage(l._id, e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            {canWrite && (
              <button
                type="button"
                style={{ marginTop: '0.4rem', width: '100%' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => (l.archived ? restore(l._id) : archive(l._id))}
              >
                {l.archived ? 'Restore' : 'Archive'}
              </button>
            )}
          </div>
        )}
      />
    </div>
  );
}
