import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import type { Item, Page } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { money, toDecimal } from '@/lib/format'
import { Confirm, Empty, ErrorNote, Field, Loading, Pagination, SearchInput, Spinner } from '@/components/ui'

export function ItemList() {
  const [params, setParams] = useSearchParams()
  const { can } = useAuth()
  const [data, setData] = useState<Page<Item> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [pending, setPending] = useState(false)

  const query = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)

  const load = useCallback(() => {
    api
      .get<Page<Item>>(`/items?q=${encodeURIComponent(query)}&page=${page}`)
      .then(setData)
      .catch((caught) => setError(caught.message))
  }, [query, page])

  useEffect(load, [load])

  const remove = async () => {
    if (!deleting) return
    setPending(true)
    try {
      await api.del(`/items/${deleting.id}`)
      setDeleting(null)
      load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete that item.')
      setDeleting(null)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="row">
        <div>
          <h1>Items</h1>
          <p className="sub">
            {data?.total ?? 0} {data?.total === 1 ? 'item' : 'items'}
          </p>
        </div>
        {can('accountant') ? (
          <Link className="btn btn-primary" to="/items/new">
            ＋ New item
          </Link>
        ) : null}
      </div>

      <ErrorNote message={error} />

      <div className="toolbar">
        <SearchInput
          value={query}
          onChange={(value) => setParams(value ? { q: value } : {}, { replace: true })}
          placeholder="Search name, HSN/SAC or description"
        />
      </div>

      <div className="card">
        {!data ? (
          <Loading />
        ) : data.rows.length === 0 ? (
          <Empty title={query ? 'No matching items' : 'No items yet'} hint="Add the products or services you bill for." />
        ) : (
          <>
            <div className="t-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>HSN / SAC</th>
                    <th>Unit</th>
                    <th className="num">Price</th>
                    <th className="num">Tax</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="strong">{item.name}</div>
                        <div className="dim" style={{ fontSize: 12 }}>
                          {item.description}
                        </div>
                      </td>
                      <td className="mono">{item.hsnSac || '—'}</td>
                      <td className="dim">{item.unit}</td>
                      <td className="num">{money(item.unitPriceMinor)}</td>
                      <td className="num">{item.defaultTaxRatePercent}%</td>
                      <td className="num">
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {can('accountant') ? (
                            <Link className="btn btn-sm" to={`/items/${item.id}/edit`}>
                              Edit
                            </Link>
                          ) : null}
                          {can('admin') ? (
                            <button className="btn btn-sm" onClick={() => setDeleting(item)}>
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
              noun="items"
              onPage={(next) => setParams(query ? { q: query, page: String(next) } : { page: String(next) })}
            />
          </>
        )}
      </div>

      {deleting ? (
        <Confirm
          title={`Delete ${deleting.name}?`}
          body="Documents already issued keep their own copy of the price and rate, so they are unaffected."
          confirmLabel="Delete"
          pending={pending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </>
  )
}

export function ItemForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    name: '',
    description: '',
    hsnSac: '',
    unit: 'unit',
    unitPrice: '0',
    taxRatePercent: '18',
  })
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .get<{ item: Item }>(`/items/${id}`)
      .then(({ item }) =>
        setForm({
          name: item.name,
          description: item.description,
          hsnSac: item.hsnSac,
          unit: item.unit,
          unitPrice: toDecimal(item.unitPriceMinor),
          taxRatePercent: item.defaultTaxRatePercent,
        }),
      )
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [id])

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      if (id) await api.patch(`/items/${id}`, form)
      else await api.post('/items', form)
      navigate('/items')
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else setError('Could not save that item.')
    } finally {
      setPending(false)
    }
  }

  if (loading) return <Loading />

  return (
    <>
      <div>
        <Link className="dim" to="/items">
          ← Back to items
        </Link>
      </div>
      <h1>{isEdit ? 'Edit item' : 'New item'}</h1>
      <ErrorNote message={error} />

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <div className="card-pad grid-form">
            <div className="span-2">
              <Field label="Name" name="name" error={fieldErrors.name}>
                <input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
              </Field>
            </div>
            <div className="span-2">
              <Field label="Description" name="description" error={fieldErrors.description}>
                <input id="description" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
            <Field label="HSN / SAC" name="hsnSac" error={fieldErrors.hsnSac} hint="4–8 digits. Needed for e-invoicing.">
              <input id="hsnSac" value={form.hsnSac} onChange={(e) => set('hsnSac', e.target.value)} />
            </Field>
            <Field label="Unit" name="unit" error={fieldErrors.unit}>
              <input id="unit" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </Field>
            <Field label="Price (₹)" name="unitPrice" error={fieldErrors.unitPrice}>
              <input id="unitPrice" inputMode="decimal" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} required />
            </Field>
            <Field label="Tax rate (%)" name="taxRatePercent" error={fieldErrors.taxRatePercent}>
              <input id="taxRatePercent" inputMode="decimal" value={form.taxRatePercent} onChange={(e) => set('taxRatePercent', e.target.value)} required />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Link className="btn" to="/items">
            Cancel
          </Link>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            {isEdit ? 'Save changes' : 'Create item'}
          </button>
        </div>
      </form>
    </>
  )
}
