import { useEffect, useRef, useState } from 'react'

/** The small pieces every screen reuses. */

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />
}

export function Loading({ what = 'Loading…' }: { what?: string }) {
  return <div className="skeleton">{what}</div>
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="alert alert-error">
      {message}
    </p>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {hint ? <div>{hint}</div> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  )
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string
  name: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children}
      {error ? <p className="field-error">{error}</p> : null}
      {!error && hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

/** Page links carrying the current filters. */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  noun,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  noun: string
}) {
  if (total === 0) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="pager">
      <span className="dim">
        {first}–{last} of {total} {noun}
      </span>
      {pageCount > 1 ? (
        <div className="pages">
          <button className="pg" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            ‹
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              className={`pg ${n === page ? 'active' : ''}`}
              aria-current={n === page ? 'page' : undefined}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          ))}
          <button className="pg" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            ›
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** A confirmation for anything irreversible. */
export function Confirm({
  title,
  body,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  pending,
}: {
  title: string
  body: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus(), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="acts">
          <button className="btn" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button ref={ref} className="btn btn-primary" onClick={onConfirm} disabled={pending}>
            {pending ? <Spinner /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A search box that waits for you to stop typing. */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const [local, setLocal] = useState(value)

  // Keep in step when the caller resets the query (a tab change, say).
  useEffect(() => setLocal(value), [value])

  useEffect(() => {
    if (local === value) return
    const timer = setTimeout(() => onChange(local), 250)
    return () => clearTimeout(timer)
  }, [local, value, onChange])

  return (
    <div className="search">
      <input
        type="search"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  )
}
