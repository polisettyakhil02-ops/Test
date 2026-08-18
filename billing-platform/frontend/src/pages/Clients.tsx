import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, api, download } from '@/api/client'
import type { Page, Party, Statement } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { formatDate, money, oneYearBefore, stateName, STATE_CODES, today } from '@/lib/format'
import { Confirm, Empty, ErrorNote, Field, Loading, Pagination, SearchInput, Spinner } from '@/components/ui'

export function ClientList() {
  const [params, setParams] = useSearchParams()
  const { can } = useAuth()
  const [data, setData] = useState<Page<Party> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Party | null>(null)
  const [pending, setPending] = useState(false)

  const query = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)

  const load = useCallback(() => {
    api
      .get<Page<Party>>(`/clients?q=${encodeURIComponent(query)}&page=${page}`)
      .then(setData)
      .catch((caught) => setError(caught.message))
  }, [query, page])

  useEffect(load, [load])

  const setQuery = useCallback(
    (value: string) => {
      // A new search is a new result set, so page 3 of the old one is meaningless.
      setParams(value ? { q: value } : {}, { replace: true })
    },
    [setParams],
  )

  const remove = async () => {
    if (!deleting) return
    setPending(true)
    try {
      await api.del(`/clients/${deleting.id}`)
      setDeleting(null)
      load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete that client.')
      setDeleting(null)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="row">
        <div>
          <h1>Clients</h1>
          <p className="sub">
            {data?.total ?? 0} {data?.total === 1 ? 'client' : 'clients'}
            {query ? ` matching “${query}”` : ''}
          </p>
        </div>
        {can('accountant') ? (
          <Link className="btn btn-primary" to="/clients/new">
            ＋ New client
          </Link>
        ) : null}
      </div>

      <ErrorNote message={error} />

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or GSTIN" />
      </div>

      <div className="card">
        {!data ? (
          <Loading />
        ) : data.rows.length === 0 ? (
          <Empty title={query ? 'No matching clients' : 'No clients yet'} hint={query ? 'Try a different search term.' : 'Add your first client to start invoicing.'} />
        ) : (
          <>
            <div className="t-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>GSTIN</th>
                    <th>Place of supply</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((party) => (
                    <tr key={party.id}>
                      <td>
                        <div className="strong">{party.name}</div>
                        <div className="dim" style={{ fontSize: 12 }}>
                          {[party.billingAddress?.line1, party.billingAddress?.city, party.billingAddress?.postalCode]
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </div>
                      </td>
                      <td>
                        {party.email || '—'}
                        <div className="dim" style={{ fontSize: 12 }}>
                          {party.phone || '—'}
                        </div>
                      </td>
                      <td className="mono">{party.gstin || '—'}</td>
                      <td className="dim">{stateName(party.stateCode)}</td>
                      <td className="num">
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Link className="btn btn-sm" to={`/clients/${party.id}/statement`}>
                            Statement
                          </Link>
                          {can('accountant') ? (
                            <Link className="btn btn-sm" to={`/clients/${party.id}/edit`}>
                              Edit
                            </Link>
                          ) : null}
                          {can('admin') ? (
                            <button className="btn btn-sm" onClick={() => setDeleting(party)}>
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageCount={data.pageCount}
              total={data.total}
              pageSize={data.pageSize}
              noun="clients"
              onPage={(next) => setParams(query ? { q: query, page: String(next) } : { page: String(next) })}
            />
          </>
        )}
      </div>

      {deleting ? (
        <Confirm
          title={`Delete ${deleting.name}?`}
          body="Clients with documents cannot be deleted — the database refuses it, so an invoice never loses the customer it was addressed to."
          confirmLabel="Delete"
          pending={pending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </>
  )
}

const EMPTY: Omit<Party, 'id'> = {
  name: '',
  email: '',
  phone: '',
  gstin: '',
  stateCode: '',
  notes: '',
  billingAddress: { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India' },
}

export function ClientForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [form, setForm] = useState<Omit<Party, 'id'>>(EMPTY)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .get<{ party: Party }>(`/clients/${id}`)
      .then(({ party }) => setForm({ ...party, billingAddress: { ...EMPTY.billingAddress, ...party.billingAddress } }))
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [id])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const setAddress = (key: keyof NonNullable<Party['billingAddress']>, value: string) =>
    setForm((current) => ({ ...current, billingAddress: { ...current.billingAddress, [key]: value } }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      if (id) await api.patch(`/clients/${id}`, form)
      else await api.post('/clients', form)
      navigate('/clients')
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else setError('Could not save that client.')
    } finally {
      setPending(false)
    }
  }

  if (loading) return <Loading />

  return (
    <>
      <div>
        <Link className="dim" to="/clients">
          ← Back to clients
        </Link>
      </div>
      <h1>{isEdit ? 'Edit client' : 'New client'}</h1>
      <ErrorNote message={error} />

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <div className="card-head">
            <h2>Details</h2>
          </div>
          <div className="card-pad grid-form">
            <div className="span-2">
              <Field label="Name" name="name" error={fieldErrors.name}>
                <input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
              </Field>
            </div>
            <Field label="Email" name="email" error={fieldErrors.email}>
              <input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Phone" name="phone" error={fieldErrors.phone}>
              <input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="GSTIN" name="gstin" error={fieldErrors.gstin} hint="Stored uppercase.">
              <input id="gstin" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} placeholder="29ABCDE1234F1Z5" />
            </Field>
            <Field
              label="Place of supply"
              name="stateCode"
              error={fieldErrors.stateCode}
              hint="Decides CGST+SGST or IGST on their invoices."
            >
              <select id="stateCode" value={form.stateCode} onChange={(e) => set('stateCode', e.target.value)}>
                <option value="">Select a state</option>
                {STATE_CODES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.code} — {state.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Billing address</h2>
            <p className="sub">The PIN code is required for e-invoicing.</p>
          </div>
          <div className="card-pad grid-form">
            <div className="span-2">
              <Field label="Address line 1" name="line1">
                <input id="line1" value={form.billingAddress?.line1 ?? ''} onChange={(e) => setAddress('line1', e.target.value)} />
              </Field>
            </div>
            <Field label="City" name="city">
              <input id="city" value={form.billingAddress?.city ?? ''} onChange={(e) => setAddress('city', e.target.value)} />
            </Field>
            <Field label="Postal code" name="postalCode">
              <input id="postalCode" value={form.billingAddress?.postalCode ?? ''} onChange={(e) => setAddress('postalCode', e.target.value)} />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Link className="btn" to="/clients">
            Cancel
          </Link>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            {isEdit ? 'Save changes' : 'Create client'}
          </button>
        </div>
      </form>
    </>
  )
}

export function ClientStatement() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const from = params.get('from') ?? oneYearBefore(today())
  const to = params.get('to') ?? today()

  const [data, setData] = useState<{ party: Party; statement: Statement } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ party: Party; statement: Statement }>(`/clients/${id}/statement?from=${from}&to=${to}`)
      .then(setData)
      .catch((caught) => setError(caught.message))
  }, [id, from, to])

  if (error) return <ErrorNote message={error} />
  if (!data) return <Loading />

  const { party, statement } = data

  return (
    <>
      <div>
        <Link className="dim" to="/clients">
          ← Back to clients
        </Link>
      </div>
      <div className="row">
        <div>
          <h1>{party.name}</h1>
          <p className="sub">
            Statement of account, {formatDate(from)} – {formatDate(to)}. Read from the receivable ledger, so it
            cannot disagree with the trial balance.
          </p>
        </div>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" type="date" defaultValue={from} onChange={(e) => setParams({ from: e.target.value, to })} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" type="date" defaultValue={to} onChange={(e) => setParams({ from, to: e.target.value })} />
          </div>
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-end' }}
            onClick={() => void download(`/clients/${id}/statement.csv?from=${from}&to=${to}`, 'statement.csv')}
          >
            CSV
          </button>
        </div>
      </div>

      <div className="bucket-strip">
        <div className="bucket">
          <div className="lbl">Opening balance</div>
          <div className="val">{money(statement.openingMinor)}</div>
        </div>
        <div className="bucket">
          <div className="lbl">Charged</div>
          <div className="val">{money(statement.chargedMinor)}</div>
        </div>
        <div className="bucket">
          <div className="lbl">Settled</div>
          <div className="val">{money(statement.settledMinor)}</div>
        </div>
        <div className="bucket">
          <div className="lbl">Closing balance</div>
          <div className="val">{money(statement.closingMinor)}</div>
        </div>
      </div>

      <div className="card t-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th className="num">Charges</th>
              <th className="num">Payments</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="dim">{formatDate(from)}</td>
              <td />
              <td className="dim">Opening balance</td>
              <td />
              <td />
              <td className="num">{money(statement.openingMinor)}</td>
            </tr>
            {statement.rows.map((row) => (
              <tr key={row.entryId}>
                <td className="dim">{formatDate(row.date)}</td>
                <td className="strong">
                  {row.documentId ? <Link to={`/documents/${row.documentId}`}>{row.docNumber ?? '—'}</Link> : row.docNumber ?? '—'}
                </td>
                <td className="dim">{row.memo}</td>
                <td className="num">{row.debitMinor ? money(row.debitMinor) : ''}</td>
                <td className="num">{row.creditMinor ? money(row.creditMinor) : ''}</td>
                <td className="num">{money(row.balanceMinor)}</td>
              </tr>
            ))}
            <tr>
              <td className="dim">{formatDate(to)}</td>
              <td />
              <td className="strong">Closing balance</td>
              <td />
              <td />
              <td className="num strong">{money(statement.closingMinor)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}
