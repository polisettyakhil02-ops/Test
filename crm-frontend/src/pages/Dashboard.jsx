import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { TaskStatusBadge } from '../components/TaskStatusBadge';

const STAGE_LABELS = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
const STATUS_LABELS = { todo: 'To do', in_progress: 'In progress', in_review: 'In review', done: 'Done' };

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p>Loading…</p>;

  return data.scope === 'developer' ? <DeveloperDashboard data={data} /> : <TeamDashboard data={data} />;
}

function DeveloperDashboard({ data }) {
  const isOverdue = (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done';

  return (
    <div>
      <h1>My Dashboard</h1>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-value">{data.openTaskCount}</div>
          <div className="stat-label">Open tasks</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{data.overdueTaskCount}</div>
          <div className="stat-label">Overdue tasks</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{data.tasksByStatus.done}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>My tasks by status</h2>
        <table>
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            {Object.entries(data.tasksByStatus).map(([status, count]) => (
              <tr key={status}>
                <td>{STATUS_LABELS[status] || status}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>My tasks</h2>
        {data.tasks.length === 0 ? (
          <p>Nothing assigned to you yet.</p>
        ) : (
          <table>
            <thead><tr><th>Title</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              {data.tasks.map((t) => (
                <tr key={t._id}>
                  <td>{t.title}</td>
                  <td><TaskStatusBadge status={t.status} /></td>
                  <td style={isOverdue(t) ? { color: 'var(--color-danger)' } : undefined}>
                    {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TeamDashboard({ data }) {
  const openPipelineValue = Object.entries(data.dealsByStage)
    .filter(([stage]) => stage !== 'won' && stage !== 'lost')
    .reduce((sum, [, v]) => sum + v.totalValue, 0);

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
          <div className="stat-value">{data.overdueTaskCount}</div>
          <div className="stat-label">Overdue tasks</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Pipeline by stage</h2>
        <table>
          <thead>
            <tr><th>Stage</th><th>Deals</th><th>Total value</th></tr>
          </thead>
          <tbody>
            {Object.entries(data.dealsByStage).map(([stage, v]) => (
              <tr key={stage}>
                <td>{STAGE_LABELS[stage] || stage}</td>
                <td>{v.count}</td>
                <td>${v.totalValue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Tasks by status</h2>
        <table>
          <thead>
            <tr><th>Status</th><th>Count</th></tr>
          </thead>
          <tbody>
            {Object.entries(data.tasksByStatus).map(([status, count]) => (
              <tr key={status}>
                <td>{STATUS_LABELS[status] || status}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  );
}
