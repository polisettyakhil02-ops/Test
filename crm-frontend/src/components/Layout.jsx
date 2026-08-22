import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { getCurrentTheme, toggleTheme } from '../lib/theme';

export function Layout() {
  const { user, logout } = useAuth();
  const canSeeClientData = user?.role === 'admin' || user?.role === 'sales';
  const [theme, setTheme] = useState(getCurrentTheme);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">Dominare CRM</div>
        <nav className="app-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          {canSeeClientData && <NavLink to="/leads">Leads</NavLink>}
          {canSeeClientData && <NavLink to="/deals">Pipeline</NavLink>}
          {canSeeClientData && <NavLink to="/companies">Companies</NavLink>}
          {canSeeClientData && <NavLink to="/contacts">Contacts</NavLink>}
          <NavLink to="/tasks">Tasks</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/chat">Chat</NavLink>
          <NavLink to="/boards">Boards</NavLink>
          {user?.role === 'admin' && <NavLink to="/rules">Automation</NavLink>}
          {user?.role === 'admin' && <NavLink to="/users">Users</NavLink>}
        </nav>
        {canSeeClientData && <SearchBar />}
        <button type="button" className="theme-toggle" onClick={() => setTheme(toggleTheme())}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <NotificationBell />
        <div className="app-user">
          <NavLink to="/profile">
            {user?.name} <em>({user?.role})</em>
          </NavLink>
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
