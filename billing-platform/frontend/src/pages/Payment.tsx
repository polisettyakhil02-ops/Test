import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import type { OpenInvoice, Party } from '@/api/types'
import { formatDate, money, today, toDecimal } from '@/lib/format'
import { Empty, ErrorNote, Field, Loading, Spinner } from '@/components/ui'

export function PaymentForm() {
  const navigate = useNavigate()
  const [parties, setParties] = useState<Party[]>([])
  const [partyId, setPartyId] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [amount, setAmount] = useState('0')
  const [reference, setReference] = useState('')
  const [open, setOpen] = useState<OpenInvoice[]>([])
  const [alloc, setAlloc] = useState<Record<string, string>>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    api
      .get<{ rows: Party[] }>('/clients?all=true')
      .then(({ rows }) => {
        setParties(rows)
        setPartyId(rows[0]?.id ?? '')
      })
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!partyId) return
    setAlloc({})
    api
      .get<{ rows: OpenInvoice[] }>(`/clients/${partyId}/open-invoices`)
      .then(({ rows }) => setOpen(rows))
      .catch((caught) => setError(caught.message))
  }, [partyId])

  const amountMinor = Math.round(Number(amount || 0) * 100)
  const allocatedMinor = useMemo(
    () => Object.values(alloc).reduce((sum, value) => sum + Math.round(Number(value || 0) * 100), 0),
    [alloc],
  )

  /** Oldest first — the same order the server settles in. */
  const autoApply = () => {
    let left = amountMinor
    const next: Record<string, string> = {}
    for (const invoice of open) {
      if (left <= 0) break
      const take = Math.min(left, invoice.openMinor)
      next[invoice.id] = toDecimal(take)
      left -= take
    }
    setAlloc(next)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      await api.post('/payments', {
        partyId,
        issueDate,
        amount,
        reference,
        allocations: Object.entries(alloc)
          .filter(([, value]) => Number(value) > 0)
          .map(([documentId, value]) => ({ documentId, amount: value })),
      })
      navigate('/documents?docType=payment')
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else setError('Could not record that payment.')
    } finally {
      setPending(false)
    }
  }

  if (loading) return <Loading />

  return (
    <>
      <div>
        <Link className="dim" to="/documents">
          ← Back to documents
        </Link>
      </div>
      <h1>Record payment</h1>
      <p className="sub">Posts Dr Bank / Cr Accounts Receivable and settles the invoices you apply it to.</p>
      <ErrorNote message={error} />

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <div className="card-pad grid-form">
            <Field label="Client" name="partyId" error={fieldErrors.partyId}>
              <select id="partyId" value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Received on" name="issueDate" error={fieldErrors.issueDate}>
              <input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
            </Field>
            <Field label="Amount (₹)" name="amount" error={fieldErrors.amount}>
              <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field label="Reference" name="reference" error={fieldErrors.reference}>
              <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="NEFT / UPI reference" />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Apply to open invoices</h2>
            <p className="sub">Each allocation is capped at what that invoice still owes.</p>
          </div>

          {open.length === 0 ? (
            <Empty title="Nothing open for this client" />
          ) : (
            <div className="t-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th className="num">Open</th>
                    <th className="num" style={{ width: 160 }}>
                      Apply
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="strong">{invoice.docNumber}</td>
                      <td className="dim">{formatDate(invoice.issueDate)}</td>
                      <td className="dim">{formatDate(invoice.dueDate)}</td>
                      <td className="num">{money(invoice.openMinor)}</td>
                      <td className="num">
                        <input
                          aria-label={`Apply to ${invoice.docNumber}`}
                          inputMode="decimal"
                          style={{ textAlign: 'right' }}
                          placeholder="0.00"
                          value={alloc[invoice.id] ?? ''}
                          onChange={(e) => setAlloc({ ...alloc, [invoice.id]: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="totals">
              <div className="line">
                <span className="dim">Payment amount</span>
                <span>{money(amountMinor)}</span>
              </div>
              <div className="line">
                <span className="dim">Allocated</span>
                <span>{money(allocatedMinor)}</span>
              </div>
              <div className="line grand">
                <span>Unapplied</span>
                <span>{money(amountMinor - allocatedMinor)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={autoApply} disabled={open.length === 0}>
            Auto-apply oldest first
          </button>
          <button className="btn btn-primary" type="submit" disabled={pending || amountMinor <= 0}>
            {pending ? <Spinner /> : null}
            Record payment
          </button>
        </div>
      </form>
    </>
  )
}
