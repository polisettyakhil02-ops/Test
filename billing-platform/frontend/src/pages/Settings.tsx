import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { Entity } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { stateName } from '@/lib/format'
import { ErrorNote, Loading } from '@/components/ui'

const ROLE_NOTES: Record<string, string> = {
  admin: 'Can do everything, including voiding posted documents and managing the outbox.',
  accountant: 'Can create, edit and post documents. Cannot void or delete.',
  viewer: 'Read-only. Every write endpoint returns 403.',
}

export function Settings() {
  const { session } = useAuth()
  const [entity, setEntity] = useState<Entity | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ entity: Entity }>('/entity')
      .then(({ entity: value }) => setEntity(value))
      .catch((caught) => setError(caught.message))
  }, [])

  return (
    <>
      <div className="row">
        <div>
          <h1>Settings</h1>
          <p className="sub">
            The entity is set up once from the backend (<span className="mono">npm run entity</span>) and is
            read-only here — changing it after documents are posted would rewrite history on issued invoices.
          </p>
        </div>
      </div>

      <ErrorNote message={error} />

      <div className="grid2">
        <div className="card">
          <div className="card-head">
            <h2>Your account</h2>
          </div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="kv">
              <span className="k" style={{ width: 110 }}>
                Name
              </span>
              <span className="strong">{session?.user.name}</span>
            </div>
            <div className="kv">
              <span className="k" style={{ width: 110 }}>
                Email
              </span>
              <span>{session?.user.email}</span>
            </div>
            <div className="kv">
              <span className="k" style={{ width: 110 }}>
                Role
              </span>
              <span className="strong">{session?.user.role}</span>
            </div>
            <p className="sub">{ROLE_NOTES[session?.user.role ?? 'viewer']}</p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Business</h2>
          </div>
          {!entity ? (
            <Loading />
          ) : (
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="kv">
                <span className="k" style={{ width: 110 }}>
                  Trading name
                </span>
                <span className="strong">{entity.name}</span>
              </div>
              <div className="kv">
                <span className="k" style={{ width: 110 }}>
                  Legal name
                </span>
                <span>{entity.legalName}</span>
              </div>
              <div className="kv">
                <span className="k" style={{ width: 110 }}>
                  GSTIN
                </span>
                <span className="mono">{entity.gstin || '—'}</span>
              </div>
              <div className="kv">
                <span className="k" style={{ width: 110 }}>
                  State
                </span>
                <span>
                  {entity.stateCode} · {stateName(entity.stateCode)}
                </span>
              </div>
              <div className="kv">
                <span className="k" style={{ width: 110 }}>
                  Address
                </span>
                <span>{entity.addressLines.filter(Boolean).join(', ') || '—'}</span>
              </div>
              <div className="kv">
                <span className="k" style={{ width: 110 }}>
                  Email
                </span>
                <span>{entity.email || '—'}</span>
              </div>
              <div className="kv">
                <span className="k" style={{ width: 110 }}>
                  Phone
                </span>
                <span>{entity.phone || '—'}</span>
              </div>
              <div className="kv">
                <span className="k" style={{ width: 110 }}>
                  Bank
                </span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{entity.bankDetails || '—'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="note">
        <b>Where the state lives.</b> The browser holds nothing but the session cookie — every figure on every
        screen is read from PostgreSQL through the API. Money crosses the wire as integer paise and is only
        turned into text for display, so rounding never accumulates on the client.
      </p>
    </>
  )
}
