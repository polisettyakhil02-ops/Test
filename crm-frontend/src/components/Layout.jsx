import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { getCurrentTheme, toggleTheme } from '../lib/theme';
import {
  DashboardIcon,
  LeadsIcon,
  PipelineIcon,
  CompaniesIcon,
  ContactsIcon,
  TasksIcon,
  ProjectsIcon,
  ChatIcon,
  BoardsIcon,
  AutomationIcon,
  TeamIcon,
  CollapseIcon,
  LogoutIcon,
} from './icons';

const SIDEBAR_STORAGE_KEY = 'dominare_sidebar_collapsed';

function readStoredCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

// Sections mirror the backend's own role split: CLIENT_DATA_ROLES
// (permissions.js) gates Sales CRM, admin-only gates Settings - Dev &
// Workspace has no `roles` key because every role can see it, same as the
// route gating in App.jsx.
const NAV_SECTIONS = [
  {
    label: 'Core',
    items: [{ to: '/', end: true, label: 'Dashboard', icon: DashboardIcon }],
  },
  {
    label: 'Sales CRM',
    roles: ['admin', 'sales'],
    items: [
      { to: '/leads', label: 'Leads', icon: LeadsIcon },
      { to: '/deals', label: 'Pipeline', icon: PipelineIcon },
      { to: '/companies', label: 'Companies', icon: CompaniesIcon },
      { to: '/contacts', label: 'Contacts', icon: ContactsIcon },
    ],
  },
  {
    label: 'Dev & Workspace',
    items: [
      { to: '/tasks', label: 'Tasks', icon: TasksIcon },
      { to: '/projects', label: 'Projects', icon: ProjectsIcon },
      { to: '/chat', label: 'Chat', icon: ChatIcon },
      { to: '/boards', label: 'Boards', icon: BoardsIcon },
    ],
  },
  {
    label: 'Settings',
    roles: ['admin'],
    items: [
      { to: '/rules', label: 'Automation Rules', icon: AutomationIcon },
      { to: '/users', label: 'Team Directory', icon: TeamIcon },
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
  const canSeeClientData = user?.role === 'admin' || user?.role === 'sales';
  const [theme, setTheme] = useState(getCurrentTheme);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // localStorage can throw in a locked-down/private context
    }
  }, [collapsed]);

  const visibleSections = NAV_SECTIONS.filter((section) => !section.roles || section.roles.includes(user?.role));

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark" aria-hidden="true" />
          <span className="sidebar-brand-text">Dominare CRM</span>
        </div>

        <nav className="sidebar-nav">
          {visibleSections.map((section) => (
            <div className="sidebar-section" key={section.label}>
              <div className="sidebar-section-label">{section.label}</div>
              {section.items.map(({ to, end, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={end} className="sidebar-link" title={label}>
                  <Icon className="sidebar-link-icon" />
                  <span className="sidebar-link-label">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon className="sidebar-link-icon" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }} />
          <span className="sidebar-link-label">Collapse</span>
        </button>
      </aside>

      <div className="app-main">
        <header className="app-header">
          {canSeeClientData && <SearchBar />}
          <div className="app-header-spacer" />
          <button type="button" className="theme-toggle" onClick={() => setTheme(toggleTheme())}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <NotificationBell />
          <div className="app-user">
            <NavLink to="/profile">
              {user?.name} <em>({user?.role})</em>
            </NavLink>
            <button type="button" onClick={logout}>
              <LogoutIcon className="app-user-logout-icon" />
              Log out
            </button>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
