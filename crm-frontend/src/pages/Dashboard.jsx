import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import DeveloperDashboard from './DeveloperDashboard';

const STAGE_LABELS = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
const CATEGORY_LABELS = { rotting_deal: 'Rotting deal', deal_no_task: 'No next step', overdue_bug: 'Overdue bug' };

// Ordinal ramp for the funnel bars: one hue (the app's own blue), monotone
// light->dark steps - position in the funnel is encoded by lightness, not
// by a different color per stage. Must stay in the same order as the
// backend's FUNNEL_STAGES (src/lib/dashboardInsights.js) - 'lost' is
// deliberately excluded from the funnel (see that file for why) and
// reported separately as funnel.lostRate.
const FUNNEL_RAMP = { new: '#86b6ef', contacted: '#5598e7', qualified: '#2a78d6', proposal: '#1c5cab', won: '#104281' };

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p>Loading…</p>;

  function reload() {
    api.dashboard().then(setData).catch((err) => setError(err.message));
  }

  return data.scope === 'developer' ? (
    <DeveloperDashboard data={data} onReload={reload} />
  ) : (
    <TeamDashboard data={data} />
  );
}

function FunnelTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="card" style={{ padding: '0.5rem 0.7rem', fontSize: '0.85rem' }}>
      <div style={{ fontWeight: 700 }}>{row.count.toLocaleString()} deals</div>
      <div className="stat-label" style={{ textTransform: 'capitalize' }}>{STAGE_LABELS[row.stage] || row.stage}</div>
      {row.dropOffFromPrev > 0 && (
        <div style={{ color: 'var(--color-danger)', marginTop: '0.2rem' }}>-{row.dropOffFromPrev}% from the previous stage</div>
      )}
    </div>
  );
}

function ActionCenter({ items }) {
  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2>Action Center</h2>
      {items.length === 0 ? (
        <p className="action-empty">Nothing needs attention right now.</p>
      ) : (
        <div className="action-list">
          {items.map((item) => (
            <Link key={item.id} to={item.link} className={`action-item severity-${item.severity}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="action-dot" aria-hidden="true" />
              <span className="action-body">
                <span className="action-category">{item.severity === 'red' ? 'Critical' : 'Needs attention'} · {CATEGORY_LABELS[item.category] || item.category}</span>
                <div className="action-title">{item.title}</div>
                <div className="action-detail">{item.detail}</div>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelSection({ funnel, stageVelocity }) {
  const chartData = funnel.stages.map((s) => ({ ...s, fill: FUNNEL_RAMP[s.stage] }));

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Pipeline funnel</h2>
        <span className="stat-label">{funnel.lostCount} lost ({funnel.lostRate}% of all deals)</span>
      </div>
      <p className="stat-label" style={{ marginTop: 0, marginBottom: '1rem' }}>
        How many deals have ever reached each stage, and the drop-off from the one before it.
      </p>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }} barCategoryGap="20%">
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="stage"
            tickFormatter={(stage) => STAGE_LABELS[stage] || stage}
            width={90}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
          />
          <Tooltip content={<FunnelTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
            {chartData.map((row) => (
              <Cell key={row.stage} fill={row.fill} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={(value) => value.toLocaleString()}
              style={{ fill: 'var(--color-text)', fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <table className="velocity-table" style={{ marginTop: '1rem' }}>
        <thead><tr><th>Stage</th><th className="num">Avg. time in stage</th></tr></thead>
        <tbody>
          {Object.entries(stageVelocity).map(([stage, v]) => (
            <tr key={stage}>
              <td>{STAGE_LABELS[stage] || stage}</td>
              <td className="num">{v.avgDays === null ? 'Not enough data yet' : `${v.avgDays.toLocaleString()} day${v.avgDays === 1 ? '' : 's'}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StalledDeals({ deals }) {
  return (
    <div className="card">
      <h2>Stalled deals</h2>
      {deals.length === 0 ? (
        <p>No deals have gone quiet - nice work staying on top of the pipeline.</p>
      ) : (
        <ul className="stalled-list">
          {deals.map((item) => (
            <li key={item.id}>
              <Link to={item.link} className="row-title">{item.title}</Link>
              <div className="row-meta">{item.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CriticalBlockers({ bugs }) {
  return (
    <div className="card">
      <h2>Critical developer blockers</h2>
      {bugs.length === 0 ? (
        <p>No overdue high-severity bugs right now.</p>
      ) : (
        <ul className="blocker-list">
          {bugs.map((item) => (
            <li key={item.id}>
              <Link to={item.link} className="row-title">{item.title}</Link>
              <div className="row-meta">{item.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamDashboard({ data }) {
  const openPipelineValue = Object.entries(data.dealsByStage)
    .filter(([stage]) => stage !== 'won' && stage !== 'lost')
    .reduce((sum, [, v]) => sum + v.totalValue, 0);

  const stalledDeals = data.actionItems.filter((i) => i.category === 'rotting_deal' || i.category === 'deal_no_task');
  const criticalBugs = data.actionItems.filter((i) => i.category === 'overdue_bug');

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-value">${openPipelineValue.toLocaleString()}</div>
          <div className="stat-label">Open pipeline value</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{data.winRate === null ? '—' : `${Math.round(data.winRate * 100)}%`}</div>
          <div className="stat-label">Win rate</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">${data.weightedForecast.toLocaleString()}</div>
          <div className="stat-label">Weighted forecast</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{data.overdueTaskCount}</div>
          <div className="stat-label">Overdue tasks</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <ActionCenter items={data.actionItems} />

        <FunnelSection funnel={data.funnel} stageVelocity={data.stageVelocity} />

        <div className="split-view" style={{ marginBottom: '1.5rem' }}>
          <StalledDeals deals={stalledDeals} />
          <CriticalBlockers bugs={criticalBugs} />
        </div>

        <div className="card">
          <h2>Recent activity</h2>
          {data.recentActivities.length === 0 ? (
            <p>No activity yet.</p>
          ) : (
            <ul className="activity-feed">
              {data.recentActivities.map((a) => (
                <li key={a._id}>
                  <strong>{a.type}</strong> — {a.body}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
