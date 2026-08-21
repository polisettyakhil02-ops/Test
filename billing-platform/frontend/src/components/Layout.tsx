import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

const NAV = [
  {
    group: 'Overview',
    links: [{ to: '/dashboard', label: 'Dashboard', icon: '▦' }],
  },
  {
    group: 'Sales',
    links: [
      { to: '/documents', label: 'Documents', icon: '☰' },
      { to: '/documents/new', label: 'New invoice', icon: '＋' },
      { to: '/payments/new', label: 'Record payment', icon: '₹' },
    ],
  },
  {
    group: 'Masters',
    links: [
      { to: '/clients', label: 'Clients', icon: '☺' },
      { to: '/items', label: 'Items', icon: '❐' },
    ],
  },
  {
    group: 'Reports',
    links: [
      { to: '/reports/ageing', label: 'Ageing', icon: '◷' },
      { to: '/reports/trial-balance', label: 'Trial balance', icon: '⚖' },
      { to: '/reports/gstr1', label: 'GSTR-1', icon: '⎘' },
    ],
  },
  {
    group: 'System',
    links: [
      { to: '/outbox', label: 'Webhook outbox', icon: '◉' },
      { to: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
]

// A list page must not stay highlighted while you are on one of its children:
// /documents/new is its own entry in the sidebar.
const EXACT = new Set(['/documents', '/clients', '/items'])

/**
 * The signed-in chrome. Rendered once as a layout route, so navigating between
 * pages swaps only the <Outlet/> — the sidebar never remounts.
 */
export function Layout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">₹</span> Billing &amp; Invoicing
        </div>

        <nav className="side">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="grp">{section.group}</div>
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={EXACT.has(link.to)}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  <span className="ico" aria-hidden="true">
                    {link.icon}
                  </span>
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="whoami">
          <b>{session?.user.name}</b>
          <span>
            {session?.user.email} · {session?.user.role}
          </span>
          <button
            className="btn btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main>
        <div className="wrap">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
