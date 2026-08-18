import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { DashboardResponse, Page, DocumentRow } from '@/api/types'
import { useAuth } from '@/lib/auth'
import {
  DOC_TYPE_LABELS,
  formatDate,
  money,
  SETTLEMENT_CLASS,
  SETTLEMENT_LABELS,
  settlementOf,
} from '@/lib/format'
import { Badge, ErrorNote, Loading } from '@/components/ui'

const BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const

export function Dashboard() {
  const { session } = useAuth()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [recent, setRecent] = useState<DocumentRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<DashboardResponse>('/reports/dashboard'),
      api.get<Page<DocumentRow>>('/documents?docType=invoice&page=1'),
    ])
      .then(([dashboard, documents]) => {
        if (cancelled) return
        setData(dashboard)
        setRecent(documents.rows.slice(0, 6))
      })
      .catch((caught) => !cancelled && setError(caught.message))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorNote message={error} />
  if (!data) return <Loading />

  const { totals, ageing } = data

  return (
    <>
      <div className="row">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">{session?.entity.name} · every figure below is derived from the ledger.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn" to="/reports/trial-balance">
            Trial balance
          </Link>
          <Link className="btn btn-primary" to="/documents/new">
            ＋ New invoice
          </Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="lbl">Revenue</div>
          <div className="val">{money(totals.revenueMinor)}</div>
          <div className="hint">Income account balance, net of credit notes</div>
        </div>
        <div className="kpi">
          <div className="lbl">Receivable</div>
          <div className="val">{money(totals.receivableMinor)}</div>
          <div className="hint">{totals.openInvoiceCount} open invoices</div>
        </div>
        <div className="kpi">
          <div className="lbl">GST payable</div>
          <div className="val">{money(totals.taxPayableMinor)}</div>
          <div className="hint">Collected and owed to the tax authority</div>
        </div>
        <div className="kpi">
          <div className="lbl">Overdue</div>
          <div className="val">{money(totals.overdueMinor)}</div>
          <div className="hint">
            {totals.overdueCount} past due · {totals.draftCount} draft
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head row">
          <h2>Ageing</h2>
          <Link className="dim" to="/reports/ageing">
            View all →
          </Link>
        </div>
        <div className="bucket-strip" style={{ border: 0, borderRadius: 0 }}>
          {BUCKETS.map((bucket) => {
            const inBucket = ageing.filter((row) => row.bucket === bucket)
            const sum = inBucket.reduce((total, row) => total + row.openMinor, 0)
            return (
              <div className="bucket" key={bucket}>
                <div className="lbl">{bucket === 'current' ? 'Not due' : `${bucket} days`}</div>
                <div className="val">{money(sum)}</div>
                <div className="hint">
                  {inBucket.length} invoice{inBucket.length === 1 ? '' : 's'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head row">
          <h2>Recent invoices</h2>
          <Link className="dim" to="/documents?docType=invoice">
            View all →
          </Link>
        </div>
        <div className="t-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Issued</th>
                <th>State</th>
                <th className="num">Total</th>
                <th className="num">Open</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => {
                const state = settlementOf(row)
                return (
                  <tr key={row.id}>
                    <td className="strong">
                      <Link to={`/documents/${row.id}`}>{row.docNumber ?? 'Draft'}</Link>
                    </td>
                    <td>{row.partyName}</td>
                    <td className="dim">{formatDate(row.issueDate)}</td>
                    <td>
                      <Badge tone={SETTLEMENT_CLASS[state]}>{SETTLEMENT_LABELS[state]}</Badge>
                    </td>
                    <td className="num">{money(row.totalMinor)}</td>
                    <td className="num">
                      {row.docType === 'payment'
                        ? '—'
                        : money(row.totalMinor - row.allocatedMinor)}
                    </td>
                  </tr>
                )
              })}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="dim">
                    No invoices yet — {DOC_TYPE_LABELS.invoice.toLowerCase()}s you raise appear here.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
