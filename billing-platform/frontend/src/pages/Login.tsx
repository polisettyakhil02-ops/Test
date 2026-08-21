import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useAuth } from '@/lib/auth'
import { ErrorNote, Field, Spinner } from '@/components/ui'

export function Login() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      await signIn(email, password)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('Could not reach the server. Check that the API is running.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="card login-card">
        <div className="brand">
          <span className="mark">₹</span> Billing &amp; Invoicing
        </div>
        <form className="card-pad" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 18 }}>Sign in</h1>
            <p className="sub">There is no public sign-up. Ask an admin for an account.</p>
          </div>

          <ErrorNote message={error} />

          <Field label="Email" name="email" error={fieldErrors.email}>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field label="Password" name="password" error={fieldErrors.password}>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
