import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import type { DrainResult, OutboxResponse } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { formatDateTime, money } from '@/lib/format'
import { Badge, Empty, ErrorNote, Loading, Spinner } from '@/components/ui'

type Row = OutboxResponse['rows'][number]

/** Delivered, dead-lettered, or still queued — decided the same way the worker decides. */
function stateOf(row: Row, maxAttempts: number) {
  if (row.deliveredAt) return { label: 'Delivered', tone: 'badge-success' }
  if (row.attempts >= maxAttempts) return { label: 'Dead-lettered', tone: 'badge-danger' }
  if (row.attempts > 0) return { label: `Retrying (${row.attempts})`, tone: 'badge-warning' }
  return { label: 'Queued', tone: 'badge-outline' }
}

export function OutboxPage() {
  const { can } = useAuth()
  const [data, setData] = useState<OutboxResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(() => {
    api
      .get<OutboxResponse>('/outbox')
      .then(setData)
      .catch((caught) => setError(caught.message))
  }, [])

  useEffect(load, [load])

  const deliver = async () => {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api.post<DrainResult>('/outbox/deliver')
      setNotice(
        result.attempted === 0
          ? 'Nothing was due — every event is either delivered or waiting out its backoff.'
          : `Attempted ${result.attempted}: ${result.delivered} delivered, ${result.failed} failed.`,
      )
      load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not run the delivery pass.')
    } finally {
      setPending(false)
    }
  }

  const retry = async (id: string) => {
    setError(null)
    try {
      await api.post(`/outbox/${id}/retry`)
      setNotice('Queued for the next delivery pass.')
      load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not requeue that event.')
    }
  }

  return (
    <>
      <div className="row">
        <div>
          <h1>Webhook outbox</h1>
          <p className="sub">
            Events are written in the same transaction that posts the document, so nothing is ever announced for
            a document that failed to save.
          </p>
        </div>
        {can('admin') ? (
          <button className="btn btn-primary" onClick={() => void deliver()} disabled={pending || !data?.configured}>
            {pending ? <Spinner /> : null}
            Deliver now
          </button>
        ) : null}
      </div>

      <ErrorNote message={error} />
      {notice ? <p className="note">{notice}</p> : null}

      {!data ? (
        <Loading />
      ) : (
        <>
          {!data.configured ? (
            <p className="note">
              <b>No receiver configured.</b> Events still accumulate here safely. Set{' '}
              <span className="mono">WEBHOOK_ENDPOINT</span> and <span className="mono">WEBHOOK_SECRET</span> on
              the backend, then run the worker (<span className="mono">npm run outbox</span>) or press Deliver
              now.
            </p>
          ) : null}

          <div className="kpis">
            <div className="kpi">
              <div className="lbl">Pending</div>
              <div className="val">{data.summary.pending}</div>
              <div className="hint">
                {data.summary.oldestPendingAt
                  ? `Oldest queued ${formatDateTime(data.summary.oldestPendingAt)}`
                  : 'Queue is clear'}
              </div>
            </div>
            <div className="kpi">
              <div className="lbl">Delivered</div>
              <div className="val">{data.summary.delivered}</div>
              <div className="hint">Acknowledged with a 2xx</div>
            </div>
            <div className="kpi">
              <div className="lbl">Dead-lettered</div>
              <div className="val">{data.summary.deadLettered}</div>
              <div className="hint">Gave up after {data.maxAttempts} attempts</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Latest events</h2>
              <p className="sub">Most recent 100. Payloads are signed with HMAC-SHA256 over the request body.</p>
            </div>

            {data.rows.length === 0 ? (
              <Empty title="No events yet" hint="Posting or voiding a document queues one." />
            ) : (
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Document</th>
                      <th className="num">Amount</th>
                      <th>Queued</th>
                      <th>State</th>
                      <th>Last error</th>
                      {can('admin') ? <th className="num">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const state = stateOf(row, data.maxAttempts)
                      return (
                        <tr key={row.id}>
                          <td className="mono">{row.topic}</td>
                          <td className="strong">
                            {row.payload.documentId ? (
                              <Link to={`/documents/${row.payload.documentId}`}>{row.payload.number ?? '—'}</Link>
                            ) : (
                              (row.payload.number ?? '—')
                            )}
                          </td>
                          <td className="num">
                            {typeof row.payload.totalMinor === 'number' ? money(row.payload.totalMinor) : '—'}
                          </td>
                          <td className="dim">{formatDateTime(row.createdAt)}</td>
                          <td>
                            <Badge tone={state.tone}>{state.label}</Badge>
                            {!row.deliveredAt && row.attempts > 0 ? (
                              <div className="dim" style={{ fontSize: 12 }}>
                                next {formatDateTime(row.nextAttemptAt)}
                              </div>
                            ) : null}
                          </td>
                          <td className="dim" style={{ maxWidth: 260, fontSize: 12 }}>
                            {row.lastError || '—'}
                          </td>
                          {can('admin') ? (
                            <td className="num">
                              {row.deliveredAt ? (
                                <span className="dim">—</span>
                              ) : (
                                <button className="btn btn-sm" onClick={() => void retry(row.id)}>
                                  Retry now
                                </button>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
