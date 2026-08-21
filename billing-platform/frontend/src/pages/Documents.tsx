import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, api, download } from '@/api/client'
import type { DocumentDetail, DocumentRow, Item, Page, Party } from '@/api/types'
import { useAuth } from '@/lib/auth'
import {
  DOC_TYPE_LABELS,
  formatDate,
  money,
  SETTLEMENT_CLASS,
  SETTLEMENT_LABELS,
  settlementOf,
  stateName,
  today,
  toDecimal,
} from '@/lib/format'
import { Badge, Confirm, Empty, ErrorNote, Field, Loading, Pagination, SearchInput, Spinner } from '@/components/ui'

const TABS: Array<[string, string]> = [
  ['', 'All'],
  ['invoice', 'Invoices'],
  ['credit_note', 'Credit notes'],
  ['payment', 'Payments'],
]

export function DocumentList() {
  const [params, setParams] = useSearchParams()
  const { can } = useAuth()
  const [data, setData] = useState<Page<DocumentRow> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const docType = params.get('docType') ?? ''
  const query = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)

  useEffect(() => {
    api
      .get<Page<DocumentRow>>(`/documents?docType=${docType}&q=${encodeURIComponent(query)}&page=${page}`)
      .then(setData)
      .catch((caught) => setError(caught.message))
  }, [docType, query, page])

  const update = (patch: Record<string, string>) => {
    const next: Record<string, string> = { docType, q: query, ...patch }
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)))
  }

  return (
    <>
      <div className="row">
        <div>
          <h1>Documents</h1>
          <p className="sub">
            {data?.total ?? 0} {data?.total === 1 ? 'document' : 'documents'}
          </p>
        </div>
        {can('accountant') ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="btn" to="/payments/new">
              Record payment
            </Link>
            <Link className="btn btn-primary" to="/documents/new">
              ＋ New invoice
            </Link>
          </div>
        ) : null}
      </div>

      <ErrorNote message={error} />

      <div className="toolbar">
        <SearchInput
          value={query}
          onChange={(value) => update({ q: value, page: '' })}
          placeholder="Search number or client"
        />
        <div className="tabs">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              className={`tab ${docType === value ? 'active' : ''}`}
              onClick={() => update({ docType: value, page: '' })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {!data ? (
          <Loading />
        ) : data.rows.length === 0 ? (
          <Empty title="Nothing here yet" hint="Raise your first invoice to get started." />
        ) : (
          <>
            <div className="t-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Issued</th>
                    <th>State</th>
                    <th className="num">Total</th>
                    <th className="num">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const state = settlementOf(row)
                    return (
                      <tr key={row.id}>
                        <td className="strong">
                          <Link to={`/documents/${row.id}`}>{row.docNumber ?? 'Draft'}</Link>
                        </td>
                        <td className="dim">{DOC_TYPE_LABELS[row.docType]}</td>
                        <td>{row.partyName}</td>
                        <td className="dim">{formatDate(row.issueDate)}</td>
                        <td>
                          <Badge tone={SETTLEMENT_CLASS[state]}>{SETTLEMENT_LABELS[state]}</Badge>
                        </td>
                        <td className="num">{money(row.totalMinor)}</td>
                        <td className="num">
                          {row.docType === 'payment' ? '—' : money(row.totalMinor - row.allocatedMinor)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageCount={data.pageCount}
              total={data.total}
              pageSize={data.pageSize}
              noun="documents"
              onPage={(next) => update({ page: String(next) })}
            />
          </>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ detail */

export function DocumentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const [data, setData] = useState<DocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'post' | 'void' | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(() => {
    api
      .get<DocumentDetail>(`/documents/${id}`)
      .then(setData)
      .catch((caught) => setError(caught.message))
  }, [id])

  useEffect(load, [load])

  const act = async (what: 'post' | 'void') => {
    setPending(true)
    setError(null)
    try {
      await api.post(`/documents/${id}/${what}`)
      setConfirming(null)
      load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : `Could not ${what} that document.`)
      setConfirming(null)
    } finally {
      setPending(false)
    }
  }

  if (error && !data) return <ErrorNote message={error} />
  if (!data) return <Loading />

  const { doc, lines, taxSummary, entryLines, einvoice, allocatedMinor } = data
  const state = settlementOf({ ...doc, allocatedMinor })
  const isDraft = doc.status === 'draft'

  return (
    <>
      <div>
        <Link className="dim" to="/documents">
          ← Back to documents
        </Link>
      </div>

      <div className="row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>{doc.docNumber ?? `${DOC_TYPE_LABELS[doc.docType]} draft`}</h1>
          <Badge tone={SETTLEMENT_CLASS[state]}>{SETTLEMENT_LABELS[state]}</Badge>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isDraft && can('accountant') ? (
            <>
              <Link className="btn" to={`/documents/${doc.id}/edit`}>
                Edit
              </Link>
              <button className="btn btn-primary" onClick={() => setConfirming('post')}>
                Post
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => void download(`/documents/${doc.id}/pdf?download=1`, 'invoice.pdf')}>
                Download PDF
              </button>
              {doc.status === 'posted' && doc.docType === 'invoice' && can('accountant') ? (
                <Link className="btn" to={`/documents/new?corrects=${doc.id}`}>
                  Credit note
                </Link>
              ) : null}
              {doc.status === 'posted' && can('admin') ? (
                <button className="btn" onClick={() => setConfirming('void')}>
                  Void
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <ErrorNote message={error} />

      <div className="card card-pad grid2">
        <div>
          <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Billed to
          </div>
          <div className="strong" style={{ marginTop: 4 }}>
            {doc.partySnapshot.name}
          </div>
          <div className="dim">{doc.partySnapshot.address}</div>
          {doc.partySnapshot.gstin ? <div className="mono dim">GSTIN {doc.partySnapshot.gstin}</div> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="kv">
            <span className="k">Issued</span>
            <span>{formatDate(doc.issueDate)}</span>
          </div>
          <div className="kv">
            <span className="k">Due</span>
            <span>{formatDate(doc.dueDate)}</span>
          </div>
          <div className="kv">
            <span className="k">Supply</span>
            <span>
              {doc.supplyKind === 'inter_state' ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'} ·{' '}
              {stateName(doc.placeOfSupply)}
            </span>
          </div>
          {doc.docType !== 'payment' ? (
            <div className="kv">
              <span className="k">Open</span>
              <span className="strong">{money(doc.totalMinor - allocatedMinor)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {lines.length > 0 ? (
        <div className="card">
          <div className="t-wrap">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>HSN / SAC</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Tax</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="strong">{line.description}</td>
                    <td className="mono">{line.hsnSac || '—'}</td>
                    <td className="num">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="num">{money(line.unitPriceMinor)}</td>
                    <td className="num">{line.taxRatePercent}%</td>
                    <td className="num">{money(line.lineTotalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="totals">
              <div className="line">
                <span className="dim">Subtotal</span>
                <span>{money(doc.subtotalMinor)}</span>
              </div>
              {doc.discountMinor > 0 ? (
                <div className="line">
                  <span className="dim">Discount</span>
                  <span>−{money(doc.discountMinor)}</span>
                </div>
              ) : null}
              {taxSummary.map((row) => (
                <div className="line" key={`${row.component}${row.ratePercent}`}>
                  <span className="dim">
                    {row.component} @ {row.ratePercent}%
                  </span>
                  <span>{money(row.amountMinor)}</span>
                </div>
              ))}
              <div className="line grand">
                <span>Total</span>
                <span>{money(doc.totalMinor)}</span>
              </div>
              <div className="line">
                <span className="dim">Settled</span>
                <span>{money(allocatedMinor)}</span>
              </div>
              {doc.status === 'posted' ? (
                <div className="line">
                  <span className="dim">Outstanding</span>
                  <span className="strong">{money(doc.totalMinor - allocatedMinor)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {einvoice ? <EinvoicePanel documentId={doc.id} doc={doc} einvoice={einvoice} onSaved={load} /> : null}

      {entryLines.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <h2>Ledger entry</h2>
            <p className="sub">
              What this document did to the books. Append-only — a correction adds a new entry rather than
              changing this one.
            </p>
          </div>
          <div className="t-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Memo</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entryLines.map((line, index) => (
                  <tr key={`${line.entryId}-${index}`}>
                    <td>
                      <span className="mono">{line.code}</span> {line.name}
                    </td>
                    <td className="dim">{line.memo}</td>
                    <td className="num">{line.debitMinor ? money(line.debitMinor) : ''}</td>
                    <td className="num">{line.creditMinor ? money(line.creditMinor) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {doc.notes || doc.terms ? (
        <div className="grid2">
          {doc.notes ? (
            <div className="card card-pad">
              <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>
                Notes
              </div>
              {doc.notes}
            </div>
          ) : null}
          {doc.terms ? (
            <div className="card card-pad">
              <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>
                Terms
              </div>
              {doc.terms}
            </div>
          ) : null}
        </div>
      ) : null}

      {confirming === 'post' ? (
        <Confirm
          title="Post this document?"
          body="It gets its number, writes a balanced entry to the ledger, and becomes read-only. Corrections after this are made with a credit note."
          confirmLabel="Post"
          pending={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void act('post')}
        />
      ) : null}

      {confirming === 'void' ? (
        <Confirm
          title={`Void ${doc.docNumber ?? 'this document'}?`}
          body="The original ledger entry stays exactly as it is. A reversing entry is posted alongside it, so the books show both what happened and that it was undone."
          confirmLabel="Void"
          pending={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void act('void')}
        />
      ) : null}

      {isDraft && can('accountant') ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn"
            onClick={async () => {
              await api.del(`/documents/${doc.id}`).catch(() => undefined)
              navigate('/documents')
            }}
          >
            Delete draft
          </button>
        </div>
      ) : null}
    </>
  )
}

function EinvoicePanel({
  documentId,
  doc,
  einvoice,
  onSaved,
}: {
  documentId: string
  doc: DocumentDetail['doc']
  einvoice: NonNullable<DocumentDetail['einvoice']>
  onSaved: () => void
}) {
  const { can } = useAuth()
  const [form, setForm] = useState({ irn: '', ackNo: '', ackDate: '', signedQrCode: '' })
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  if (doc.irn) {
    return (
      <div className="card">
        <div className="card-head">
          <h2>Registered</h2>
          <p className="sub">This invoice carries an IRN. The QR below is printed on the PDF.</p>
        </div>
        <div className="card-pad" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {einvoice.qrDataUrl ? <img className="qr" src={einvoice.qrDataUrl} alt="Signed e-invoice QR code" /> : null}
          <div>
            <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              IRN
            </div>
            <div className="mono" style={{ wordBreak: 'break-all' }}>
              {doc.irn}
            </div>
            <div
              className="dim"
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 10 }}
            >
              Acknowledgement
            </div>
            <div className="mono">
              {doc.ackNo} · {doc.ackDate}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      await api.post(`/documents/${documentId}/irn`, form)
      onSaved()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else setError('Could not record the IRN.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>e-Invoicing</h2>
        <p className="sub">
          Download the IRP payload, register it, then record what comes back. The IRN is stamped once and cannot
          be changed afterwards.
        </p>
      </div>

      {einvoice.blockers.length > 0 ? (
        <div className="card-pad">
          <div className="strong" style={{ marginBottom: 8 }}>
            Not registrable yet
          </div>
          <ul className="dim" style={{ margin: 0, paddingLeft: 18 }}>
            {einvoice.blockers.map((blocker) => (
              <li key={blocker.field}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <button
            className="btn"
            style={{ width: 'fit-content' }}
            onClick={() => void download(`/documents/${documentId}/einvoice`, 'einvoice.json')}
          >
            Download IRP payload
          </button>

          {can('accountant') ? (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ErrorNote message={error} />
              <div className="grid-form">
                <Field label="IRN" name="irn" error={fieldErrors.irn} hint="64 hexadecimal characters">
                  <input id="irn" value={form.irn} onChange={(e) => setForm({ ...form, irn: e.target.value })} required />
                </Field>
                <Field label="Acknowledgement no." name="ackNo" error={fieldErrors.ackNo}>
                  <input id="ackNo" value={form.ackNo} onChange={(e) => setForm({ ...form, ackNo: e.target.value })} required />
                </Field>
                <Field label="Acknowledgement date" name="ackDate" error={fieldErrors.ackDate}>
                  <input
                    id="ackDate"
                    placeholder="2026-08-17 10:32:00"
                    value={form.ackDate}
                    onChange={(e) => setForm({ ...form, ackDate: e.target.value })}
                    required
                  />
                </Field>
                <div className="span-2">
                  <Field label="Signed QR string" name="signedQrCode" error={fieldErrors.signedQrCode}>
                    <textarea
                      id="signedQrCode"
                      rows={3}
                      placeholder="eyJhbGciOi..."
                      value={form.signedQrCode}
                      onChange={(e) => setForm({ ...form, signedQrCode: e.target.value })}
                      required
                    />
                  </Field>
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={pending} style={{ width: 'fit-content' }}>
                {pending ? <Spinner /> : null}
                Record IRN
              </button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- form */

interface LineDraft {
  key: string
  itemId: string | null
  description: string
  hsnSac: string
  unit: string
  quantity: string
  unitPrice: string
  taxRatePercent: string
}

const blankLine = (): LineDraft => ({
  key: Math.random().toString(36).slice(2),
  itemId: null,
  description: '',
  hsnSac: '',
  unit: 'unit',
  quantity: '1',
  unitPrice: '0',
  taxRatePercent: '18',
})

export function DocumentForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const corrects = params.get('corrects')

  const [parties, setParties] = useState<Party[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [entityState, setEntityState] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  const [docType, setDocType] = useState<'invoice' | 'credit_note'>('invoice')
  const [partyId, setPartyId] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [discountValue, setDiscountValue] = useState('0')
  const [lines, setLines] = useState<LineDraft[]>([blankLine()])

  useEffect(() => {
    const load = async () => {
      try {
        const [partyList, itemList, entity] = await Promise.all([
          api.get<{ rows: Party[] }>('/clients?all=true'),
          api.get<{ rows: Item[] }>('/items?all=true'),
          api.get<{ entity: { stateCode: string } }>('/entity'),
        ])
        setParties(partyList.rows)
        setItems(itemList.rows)
        setEntityState(entity.entity.stateCode)

        // A credit note starts as a copy of the invoice it corrects; an edit
        // starts as the draft itself.
        const source = id ?? corrects
        if (source) {
          const detail = await api.get<DocumentDetail>(`/documents/${source}`)
          setDocType(id ? (detail.doc.docType as 'invoice' | 'credit_note') : 'credit_note')
          setPartyId(detail.doc.partyId)
          setIssueDate(id ? detail.doc.issueDate : today())
          setDueDate(id ? (detail.doc.dueDate ?? '') : '')
          setDiscountValue(id ? toDecimal(detail.doc.discountMinor) : '0')
          setLines(
            detail.lines.map((line) => ({
              key: line.id,
              itemId: line.itemId,
              description: line.description,
              hsnSac: line.hsnSac,
              unit: line.unit,
              quantity: line.quantity,
              unitPrice: toDecimal(line.unitPriceMinor),
              taxRatePercent: line.taxRatePercent,
            })),
          )
        } else {
          setPartyId(partyList.rows[0]?.id ?? '')
        }
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not load the form.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id, corrects])

  const party = parties.find((p) => p.id === partyId)
  const interState = Boolean(party && entityState && party.stateCode && party.stateCode !== entityState)

  /**
   * Totals shown while typing.
   *
   * Deliberately an estimate, and labelled as one: the server re-prices on save
   * with integer paise and the largest-remainder discount split, and its answer
   * is the one that is stored. Duplicating that arithmetic here would be a
   * second implementation to keep in step.
   */
  const preview = useMemo(() => {
    let subtotal = 0
    let tax = 0
    for (const line of lines) {
      const qty = Number(line.quantity)
      const price = Number(line.unitPrice)
      if (!Number.isFinite(qty) || !Number.isFinite(price)) continue
      const amount = Math.round(qty * price * 100)
      subtotal += amount
    }
    const discount = Math.min(Math.max(Math.round(Number(discountValue || 0) * 100), 0), subtotal)
    for (const line of lines) {
      const qty = Number(line.quantity)
      const price = Number(line.unitPrice)
      const rate = Number(line.taxRatePercent)
      if (!Number.isFinite(qty) || !Number.isFinite(price) || !Number.isFinite(rate)) continue
      const amount = Math.round(qty * price * 100)
      const share = subtotal > 0 ? Math.round((discount * amount) / subtotal) : 0
      tax += Math.round(((amount - share) * rate) / 100)
    }
    return { subtotal, discount, tax, total: subtotal - discount + tax }
  }, [lines, discountValue])

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const addFromItem = (itemId: string) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    const line: LineDraft = {
      key: Math.random().toString(36).slice(2),
      itemId: item.id,
      description: item.name,
      hsnSac: item.hsnSac,
      unit: item.unit,
      quantity: '1',
      unitPrice: toDecimal(item.unitPriceMinor),
      taxRatePercent: item.defaultTaxRatePercent,
    }
    setLines((current) => {
      const blank = current.findIndex((l) => !l.description.trim())
      if (blank >= 0) return current.map((l, i) => (i === blank ? line : l))
      return [...current, line]
    })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})

    const body = {
      docType,
      correctsDocumentId: corrects ?? null,
      partyId,
      issueDate,
      dueDate: dueDate || '',
      discountType: 'fixed' as const,
      discountValue: discountValue || '0',
      notes: '',
      terms: '',
      lines: lines
        .filter((line) => line.description.trim())
        .map((line) => ({
          itemId: line.itemId,
          description: line.description,
          hsnSac: line.hsnSac,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRatePercent: line.taxRatePercent,
        })),
    }

    try {
      const result = id
        ? await api.patch<{ id: string }>(`/documents/${id}`, body)
        : await api.post<{ id: string }>('/documents', body)
      navigate(`/documents/${result.id}`)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else setError('Could not save that document.')
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
      <h1>{id ? 'Edit draft' : docType === 'credit_note' ? 'New credit note' : 'New invoice'}</h1>
      <ErrorNote message={error} />

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <div className="card-head">
            <h2>{docType === 'credit_note' ? 'Credit note' : 'Invoice'} details</h2>
          </div>
          <div className="card-pad grid-form">
            <Field
              label="Client"
              name="partyId"
              error={fieldErrors.partyId}
              hint={party ? `${stateName(party.stateCode)} · ${interState ? 'IGST applies' : 'CGST + SGST apply'}` : undefined}
            >
              <select id="partyId" value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                <option value="">Select a client</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Issue date" name="issueDate" error={fieldErrors.issueDate}>
              <input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
            </Field>
            <Field label="Due date" name="dueDate" error={fieldErrors.dueDate}>
              <input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Discount (₹)" name="discountValue" error={fieldErrors.discountValue}>
              <input
                id="discountValue"
                inputMode="decimal"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head row">
            <h2>Line items</h2>
            {items.length > 0 ? (
              <select
                aria-label="Add from items"
                value=""
                style={{ maxWidth: 240 }}
                onChange={(e) => {
                  addFromItem(e.target.value)
                  e.target.value = ''
                }}
              >
                <option value="">Add from items…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {money(item.unitPriceMinor)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="card-pad">
            <div className="lines-head">
              <div>Description</div>
              <div>HSN / SAC</div>
              <div>Qty</div>
              <div>Rate</div>
              <div>Tax %</div>
              <div>Line total</div>
              <div />
            </div>

            {lines.map((line, index) => {
              const amount = Math.round(Number(line.quantity || 0) * Number(line.unitPrice || 0) * 100)
              return (
                <div className="line-row" key={line.key}>
                  <input
                    aria-label={`Description ${index + 1}`}
                    value={line.description}
                    onChange={(e) => setLine(line.key, { description: e.target.value })}
                    placeholder="What are you billing for?"
                  />
                  <input
                    aria-label={`HSN ${index + 1}`}
                    value={line.hsnSac}
                    onChange={(e) => setLine(line.key, { hsnSac: e.target.value })}
                  />
                  <input
                    aria-label={`Quantity ${index + 1}`}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                  />
                  <input
                    aria-label={`Rate ${index + 1}`}
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                  />
                  <input
                    aria-label={`Tax ${index + 1}`}
                    inputMode="decimal"
                    value={line.taxRatePercent}
                    onChange={(e) => setLine(line.key, { taxRatePercent: e.target.value })}
                  />
                  <div className="num strong">{money(Number.isFinite(amount) ? amount : 0)}</div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                  >
                    ✕
                  </button>
                </div>
              )
            })}

            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-sm" onClick={() => setLines((c) => [...c, blankLine()])}>
                ＋ Add line
              </button>
            </div>
            {fieldErrors.lines ? <p className="field-error">{fieldErrors.lines}</p> : null}
          </div>

          <div className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="totals">
              <div className="line">
                <span className="dim">Subtotal</span>
                <span>{money(preview.subtotal)}</span>
              </div>
              {preview.discount > 0 ? (
                <div className="line">
                  <span className="dim">Discount</span>
                  <span>−{money(preview.discount)}</span>
                </div>
              ) : null}
              <div className="line">
                <span className="dim">{interState ? 'IGST' : 'CGST + SGST'} (estimate)</span>
                <span>{money(preview.tax)}</span>
              </div>
              <div className="line grand">
                <span>Total</span>
                <span>{money(preview.total)}</span>
              </div>
            </div>
            <p className="hint" style={{ textAlign: 'right' }}>
              The server re-prices on save in integer paise; its figure is the one stored.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Link className="btn" to="/documents">
            Cancel
          </Link>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            {id ? 'Save draft' : 'Create draft'}
          </button>
        </div>
      </form>
    </>
  )
}
