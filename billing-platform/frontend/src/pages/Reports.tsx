import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, download } from '@/api/client'
import type { AgeingRow, Gstr1, TrialBalance } from '@/api/types'
import {
  endOfMonth,
  formatDate,
  money,
  startOfMonth,
  stateName,
  today,
} from '@/lib/format'
import { Empty, ErrorNote, Loading, Spinner } from '@/components/ui'

const BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const

const BUCKET_LABELS: Record<(typeof BUCKETS)[number], string> = {
  current: 'Not yet due',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': '90+ days',
}

/* ------------------------------------------------------------------ ageing */

export function AgeingReport() {
  const [rows, setRows] = useState<AgeingRow[] | null>(null)
  const [asOf, setAsOf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [bucket, setBucket] = useState<'all' | (typeof BUCKETS)[number]>('all')

  useEffect(() => {
    api
      .get<{ asOf: string; rows: AgeingRow[] }>('/reports/ageing')
      .then((data) => {
        setAsOf(data.asOf)
        setRows(data.rows)
      })
      .catch((caught) => setError(caught.message))
  }, [])

  const shown = useMemo(
    () => (rows ?? []).filter((row) => bucket === 'all' || row.bucket === bucket),
    [rows, bucket],
  )
  const total = shown.reduce((sum, row) => sum + row.openMinor, 0)

  return (
    <>
      <div className="row">
        <div>
          <h1>Ageing</h1>
          <p className="sub">
            Everything still open{asOf ? ` as at ${formatDate(asOf)}` : ''}. Open amount is the invoice total
            less what has been applied to it.
          </p>
        </div>
      </div>

      <ErrorNote message={error} />

      {!rows ? (
        <Loading />
      ) : (
        <>
          <div className="bucket-strip">
            {BUCKETS.map((key) => {
              const inBucket = rows.filter((row) => row.bucket === key)
              return (
                <div className="bucket" key={key}>
                  <div className="lbl">{BUCKET_LABELS[key]}</div>
                  <div className="val">{money(inBucket.reduce((sum, row) => sum + row.openMinor, 0))}</div>
                  <div className="hint">
                    {inBucket.length} invoice{inBucket.length === 1 ? '' : 's'}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="tabs">
            <button className={`tab ${bucket === 'all' ? 'active' : ''}`} onClick={() => setBucket('all')}>
              All ({rows.length})
            </button>
            {BUCKETS.map((key) => (
              <button
                key={key}
                className={`tab ${bucket === key ? 'active' : ''}`}
                onClick={() => setBucket(key)}
              >
                {BUCKET_LABELS[key]}
              </button>
            ))}
          </div>

          <div className="card">
            {shown.length === 0 ? (
              <Empty
                title={bucket === 'all' ? 'Nothing outstanding' : 'Nothing in this bucket'}
                hint="Posted invoices that still owe something appear here."
              />
            ) : (
              <>
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Client</th>
                        <th>Issued</th>
                        <th>Due</th>
                        <th className="num">Total</th>
                        <th className="num">Received</th>
                        <th className="num">Open</th>
                        <th className="num">Overdue by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((row) => (
                        <tr key={row.documentId}>
                          <td className="strong">
                            <Link to={`/documents/${row.documentId}`}>{row.docNumber ?? 'Draft'}</Link>
                          </td>
                          <td>
                            <Link to={`/clients/${row.partyId}/statement`}>{row.partyName}</Link>
                          </td>
                          <td className="dim">{formatDate(row.issueDate)}</td>
                          <td className="dim">{formatDate(row.dueDate)}</td>
                          <td className="num">{money(row.totalMinor)}</td>
                          <td className="num">{money(row.allocatedMinor)}</td>
                          <td className="num strong">{money(row.openMinor)}</td>
                          <td className="num">
                            {row.daysOverdue > 0 ? `${row.daysOverdue} day${row.daysOverdue === 1 ? '' : 's'}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={6} className="strong">
                          Total open
                        </td>
                        <td className="num strong">{money(total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

/* ----------------------------------------------------------- trial balance */

export function TrialBalanceReport() {
  const [data, setData] = useState<TrialBalance | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<TrialBalance>('/reports/trial-balance')
      .then(setData)
      .catch((caught) => setError(caught.message))
  }, [])

  const balanced = data ? data.totalDebitMinor === data.totalCreditMinor : false

  return (
    <>
      <div className="row">
        <div>
          <h1>Trial balance</h1>
          <p className="sub">Summed straight from the journal lines. Nothing here is stored as a total.</p>
        </div>
      </div>

      <ErrorNote message={error} />

      {!data ? (
        <Loading />
      ) : (
        <>
          <div className={balanced ? 'note' : 'alert alert-error'}>
            {balanced ? (
              <>
                <b>Debits equal credits</b> — {money(data.totalDebitMinor)} on each side. The database enforces
                this with a deferred constraint trigger, so an unbalanced entry can never commit.
              </>
            ) : (
              <>
                Debits {money(data.totalDebitMinor)} do not equal credits {money(data.totalCreditMinor)}. That
                should be impossible — report it.
              </>
            )}
          </div>

          <div className="card">
            <div className="t-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.accountId}>
                      <td className="mono">{row.code}</td>
                      <td className="strong">{row.name}</td>
                      <td className="dim">{row.type}</td>
                      <td className="num">{money(row.debitMinor)}</td>
                      <td className="num">{money(row.creditMinor)}</td>
                      <td className="num strong">{money(row.balanceMinor)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="dim">
                        No entries posted yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="strong">
                      Totals
                    </td>
                    <td className="num strong">{money(data.totalDebitMinor)}</td>
                    <td className="num strong">{money(data.totalCreditMinor)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ GSTR-1 */

type Section = 'b2b' | 'b2cl' | 'b2cs' | 'cdnr' | 'hsn'

const SECTION_LABELS: Record<Section, string> = {
  b2b: 'B2B',
  b2cl: 'B2CL',
  b2cs: 'B2CS',
  cdnr: 'CDNR',
  hsn: 'HSN',
}

const SECTION_NOTES: Record<Section, string> = {
  b2b: 'Supplies to registered persons — one row per invoice and rate.',
  b2cl: 'Inter-state supplies to unregistered persons above ₹2,50,000.',
  b2cs: 'Everything else to unregistered persons, summarised by place of supply and rate.',
  cdnr: 'Credit notes against registered persons.',
  hsn: 'Quantity and value by HSN/SAC across the whole period.',
}

export function Gstr1Report() {
  const [from, setFrom] = useState(startOfMonth(today()))
  const [to, setTo] = useState(endOfMonth(today()))
  const [data, setData] = useState<Gstr1 | null>(null)
  const [section, setSection] = useState<Section>('b2b')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api
      .get<Gstr1>(`/reports/gstr1?from=${from}&to=${to}`)
      .then((value) => {
        setData(value)
        setError(null)
      })
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [from, to])

  const exportCsv = async () => {
    setDownloading(true)
    setError(null)
    try {
      await download(`/reports/gstr1.csv?from=${from}&to=${to}`, `gstr1-${from}-to-${to}.csv`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not download the CSV.')
    } finally {
      setDownloading(false)
    }
  }

  const counts: Record<Section, number> = {
    b2b: data?.b2b.length ?? 0,
    b2cl: data?.b2cl.length ?? 0,
    b2cs: data?.b2cs.length ?? 0,
    cdnr: data?.cdnr.length ?? 0,
    hsn: data?.hsn.length ?? 0,
  }

  return (
    <>
      <div className="row">
        <div>
          <h1>GSTR-1</h1>
          <p className="sub">Built from posted documents in the period. Drafts and voided documents are excluded.</p>
        </div>
        <button className="btn btn-primary" onClick={() => void exportCsv()} disabled={downloading || !data}>
          {downloading ? <Spinner /> : null}
          Export CSV
        </button>
      </div>

      <ErrorNote message={error} />

      <div className="card">
        <div className="card-pad grid-form">
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
      </div>

      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="lbl">Taxable value</div>
              <div className="val">{money(data.totals.taxableMinor)}</div>
              <div className="hint">Before GST</div>
            </div>
            <div className="kpi">
              <div className="lbl">Tax</div>
              <div className="val">{money(data.totals.taxMinor)}</div>
              <div className="hint">CGST + SGST + IGST</div>
            </div>
            <div className="kpi">
              <div className="lbl">Documents</div>
              <div className="val">{data.totals.documentCount}</div>
              <div className="hint">
                {formatDate(data.from)} – {formatDate(data.to)}
              </div>
            </div>
          </div>

          <div className="tabs">
            {(Object.keys(SECTION_LABELS) as Section[]).map((key) => (
              <button
                key={key}
                className={`tab ${section === key ? 'active' : ''}`}
                onClick={() => setSection(key)}
              >
                {SECTION_LABELS[key]} ({counts[key]})
              </button>
            ))}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{SECTION_LABELS[section]}</h2>
              <p className="sub">{SECTION_NOTES[section]}</p>
            </div>

            {counts[section] === 0 ? (
              <Empty title="Nothing in this section for the period" />
            ) : (
              <div className="t-wrap">
                {section === 'b2b' ? (
                  <table>
                    <thead>
                      <tr>
                        <th>GSTIN</th>
                        <th>Receiver</th>
                        <th>Invoice</th>
                        <th>Date</th>
                        <th>Place of supply</th>
                        <th className="num">Rate</th>
                        <th className="num">Taxable</th>
                        <th className="num">Invoice value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.b2b.map((row, index) => (
                        <tr key={`${row.invoiceNumber}-${row.ratePercent}-${index}`}>
                          <td className="mono">{row.gstin}</td>
                          <td>{row.receiver}</td>
                          <td className="strong">{row.invoiceNumber}</td>
                          <td className="dim">{formatDate(row.invoiceDate)}</td>
                          <td className="dim">
                            {row.placeOfSupply} · {stateName(row.placeOfSupply)}
                          </td>
                          <td className="num">{row.ratePercent}%</td>
                          <td className="num">{money(row.taxableMinor)}</td>
                          <td className="num">{money(row.invoiceValueMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {section === 'b2cl' ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Date</th>
                        <th>Place of supply</th>
                        <th className="num">Rate</th>
                        <th className="num">Taxable</th>
                        <th className="num">Invoice value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.b2cl.map((row, index) => (
                        <tr key={`${row.invoiceNumber}-${row.ratePercent}-${index}`}>
                          <td className="strong">{row.invoiceNumber}</td>
                          <td className="dim">{formatDate(row.invoiceDate)}</td>
                          <td className="dim">
                            {row.placeOfSupply} · {stateName(row.placeOfSupply)}
                          </td>
                          <td className="num">{row.ratePercent}%</td>
                          <td className="num">{money(row.taxableMinor)}</td>
                          <td className="num">{money(row.invoiceValueMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {section === 'b2cs' ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Place of supply</th>
                        <th className="num">Rate</th>
                        <th className="num">Taxable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.b2cs.map((row, index) => (
                        <tr key={`${row.placeOfSupply}-${row.ratePercent}-${index}`}>
                          <td className="mono">{row.type}</td>
                          <td className="dim">
                            {row.placeOfSupply} · {stateName(row.placeOfSupply)}
                          </td>
                          <td className="num">{row.ratePercent}%</td>
                          <td className="num">{money(row.taxableMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {section === 'cdnr' ? (
                  <table>
                    <thead>
                      <tr>
                        <th>GSTIN</th>
                        <th>Receiver</th>
                        <th>Note</th>
                        <th>Date</th>
                        <th>Against</th>
                        <th className="num">Rate</th>
                        <th className="num">Taxable</th>
                        <th className="num">Note value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cdnr.map((row, index) => (
                        <tr key={`${row.noteNumber}-${row.ratePercent}-${index}`}>
                          <td className="mono">{row.gstin}</td>
                          <td>{row.receiver}</td>
                          <td className="strong">{row.noteNumber}</td>
                          <td className="dim">{formatDate(row.noteDate)}</td>
                          <td className="dim">
                            {row.originalInvoiceNumber} · {formatDate(row.originalInvoiceDate)}
                          </td>
                          <td className="num">{row.ratePercent}%</td>
                          <td className="num">{money(row.taxableMinor)}</td>
                          <td className="num">{money(row.noteValueMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {section === 'hsn' ? (
                  <table>
                    <thead>
                      <tr>
                        <th>HSN / SAC</th>
                        <th>Description</th>
                        <th>Unit</th>
                        <th className="num">Quantity</th>
                        <th className="num">Taxable</th>
                        <th className="num">Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.hsn.map((row, index) => (
                        <tr key={`${row.hsnSac}-${index}`}>
                          <td className="mono">{row.hsnSac}</td>
                          <td>{row.description}</td>
                          <td className="dim">{row.unit}</td>
                          <td className="num">{row.quantity}</td>
                          <td className="num">{money(row.taxableMinor)}</td>
                          <td className="num">{money(row.taxMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
