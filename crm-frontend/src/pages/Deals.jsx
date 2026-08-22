import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DEAL_STAGES } from '../components/StageBadge';
import { downloadCsv } from '../lib/csv';
import { DndBoard } from '../components/DndBoard';

export default function Deals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite = user.role === 'admin' || user.role === 'sales';
  const [deals, setDeals] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [owners, setOwners] = useState([]);
  const [error, setError] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState('');

  function load(archived) {
    const params = archived ? { archived: 'true' } : {};
    api.deals.list(params).then((d) => setDeals(d.deals)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load(showArchived);
    api.companies.list().then((d) => setCompanies(d.companies)).catch(() => {});
    if (canWrite) {
      api.users.list().then((d) => setOwners(d.users)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const ownerName = (id) => owners.find((o) => o._id === id)?.name || '—';
  const companyName = (id) => companies.find((c) => c._id === id)?.name || '—';

  const visibleDeals = useMemo(() => {
    if (!ownerFilter) return deals;
    return deals.filter((d) => String(d.ownerId) === ownerFilter);
  }, [deals, ownerFilter]);

  async function moveStage(dealId, stage) {
    let reason;
    if (stage === 'lost') {
      reason = window.prompt('Why was this deal lost? (optional)') || undefined;
    }
    try {
      await api.deals.setStage(dealId, stage, reason);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function archive(id) {
    try {
      await api.deals.archive(id);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  async function restore(id) {
    try {
      await api.deals.restore(id);
      load(showArchived);
    } catch (err) {
      setError(err.message);
    }
  }

  function exportCsv() {
    downloadCsv('deals.csv', [
      { label: 'Title', value: (d) => d.title },
      { label: 'Company', value: (d) => companyName(d.companyId) },
      { label: 'Stage', value: (d) => d.stage },
      { label: 'Value', value: (d) => d.value },
      { label: 'Owner', value: (d) => ownerName(d.ownerId) },
    ], visibleDeals);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Pipeline</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={exportCsv}>Export CSV</button>
          {canWrite && (
            <button type="button" className="primary" onClick={() => navigate('/deals/new')}>Register deal</button>
          )}
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

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
        columns={DEAL_STAGES.map((stage) => ({ key: stage }))}
        items={visibleDeals}
        getItemId={(d) => d._id}
        getItemColumn={(d) => d.stage}
        onMove={(dealId, stage) => moveStage(dealId, stage)}
        canDrag={() => canWrite && !showArchived}
        renderColumnHeader={(col, items) => <h3>{col.key} ({items.length})</h3>}
        renderCard={(d) => (
          <div className="board-card">
            <div className="board-card-title" onPointerDown={(e) => e.stopPropagation()}>
              <Link to={`/deals/${d._id}`}>{d.title}</Link>
            </div>
            <div>${d.value.toLocaleString()}</div>
            {canWrite && !showArchived && (
              <select value={d.stage} onChange={(e) => moveStage(d._id, e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            {canWrite && (
              <button
                type="button"
                style={{ marginTop: '0.4rem', width: '100%' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => (d.archived ? restore(d._id) : archive(d._id))}
              >
                {d.archived ? 'Restore' : 'Archive'}
              </button>
            )}
          </div>
        )}
      />
    </div>
  );
}
