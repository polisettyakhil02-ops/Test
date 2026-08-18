import { useEffect } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { onUnauthorized } from '@/api/client'
import { useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'
import { Loading } from '@/components/ui'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { ClientForm, ClientList, ClientStatement } from '@/pages/Clients'
import { ItemForm, ItemList } from '@/pages/Items'
import { DocumentDetailPage, DocumentForm, DocumentList } from '@/pages/Documents'
import { PaymentForm } from '@/pages/Payment'
import { AgeingReport, Gstr1Report, TrialBalanceReport } from '@/pages/Reports'
import { OutboxPage } from '@/pages/Outbox'
import { Settings } from '@/pages/Settings'

/**
 * The gate in front of everything signed-in.
 *
 * A layout route rather than a wrapper around each element: the sidebar is
 * mounted once, and there is exactly one place that decides whether you are
 * allowed past.
 */
function Protected() {
  const { session, loading } = useAuth()
  const location = useLocation()

  // Nothing is rendered until we know who we are. Guessing would flash the
  // login screen at someone who is already signed in.
  if (loading) return <Loading what="Checking your session…" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Layout />
}

function NotFound() {
  return (
    <div className="empty">
      <div className="big">Page not found</div>
      <div>
        That address does not match anything in the app.{' '}
        <NavLink to="/dashboard">Back to the dashboard</NavLink>.
      </div>
    </div>
  )
}

export function App() {
  const navigate = useNavigate()

  // A 401 from any request sends you to the login screen once, rather than
  // leaving a page of failed panels behind.
  useEffect(
    () =>
      onUnauthorized(() => {
        if (!window.location.pathname.endsWith('/login')) navigate('/login', { replace: true })
      }),
    [navigate],
  )

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<Protected />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/clients" element={<ClientList />} />
        <Route path="/clients/new" element={<ClientForm />} />
        <Route path="/clients/:id/edit" element={<ClientForm />} />
        <Route path="/clients/:id/statement" element={<ClientStatement />} />

        <Route path="/items" element={<ItemList />} />
        <Route path="/items/new" element={<ItemForm />} />
        <Route path="/items/:id/edit" element={<ItemForm />} />

        <Route path="/documents" element={<DocumentList />} />
        <Route path="/documents/new" element={<DocumentForm />} />
        <Route path="/documents/:id" element={<DocumentDetailPage />} />
        <Route path="/documents/:id/edit" element={<DocumentForm />} />

        <Route path="/payments/new" element={<PaymentForm />} />

        <Route path="/reports/ageing" element={<AgeingReport />} />
        <Route path="/reports/trial-balance" element={<TrialBalanceReport />} />
        <Route path="/reports/gstr1" element={<Gstr1Report />} />

        <Route path="/outbox" element={<OutboxPage />} />
        <Route path="/settings" element={<Settings />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
