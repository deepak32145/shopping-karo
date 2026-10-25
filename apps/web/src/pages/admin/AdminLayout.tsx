import { NavLink, Outlet } from 'react-router-dom';
import type { User } from '../../auth';

interface Props {
  user: User | null;
  authReady: boolean;
  onSignIn: () => void;
}

/** The shell of the admin area: access check plus the Overview / Orders / Products tabs. */
export default function AdminLayout({ user, authReady, onSignIn }: Props) {
  if (!authReady) return <main className="admin"><p className="muted">Loading…</p></main>;
  if (!user) {
    return (
      <main className="admin">
        <div className="empty">
          <h2>Admin sign-in</h2>
          <p>Sign in with the admin account to manage the store.</p>
          <button className="btn btn-dark" onClick={onSignIn}>Sign in</button>
        </div>
      </main>
    );
  }
  if (!user.roles.includes('ADMIN')) {
    return (
      <main className="admin">
        <div className="empty"><h2>Admins only</h2><p>Your account doesn't have access to this area.</p></div>
      </main>
    );
  }

  return (
    <main className="admin">
      <nav className="admin-tabs" aria-label="Admin sections">
        <NavLink to="/admin" end>Overview</NavLink>
        <NavLink to="/admin/orders">Orders</NavLink>
        <NavLink to="/admin/products">Products &amp; stock</NavLink>
      </nav>
      <Outlet />
    </main>
  );
}
