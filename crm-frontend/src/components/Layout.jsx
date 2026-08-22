import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">Dominare CRM</div>
        <nav className="app-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/deals">Pipeline</NavLink>
          <NavLink to="/companies">Companies</NavLink>
          <NavLink to="/contacts">Contacts</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
          {user?.role === 'admin' && <NavLink to="/users">Users</NavLink>}
        </nav>
        <div className="app-user">
          <span>
            {user?.name} <em>({user?.role})</em>
          </span>
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
