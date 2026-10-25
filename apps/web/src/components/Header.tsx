import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '../auth';

interface Props {
  user: User | null;
  authReady: boolean;
  onSignIn: () => void;
  onLogout: () => void;
  query: string;
  onQuery: (q: string) => void;
  onSubmit: () => void;
  cartCount: number;
  onOpenCart: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function Header({ user, authReady, onSignIn, onLogout, query, onQuery, onSubmit, cartCount, onOpenCart, theme, onToggleTheme }: Props) {
  return (
    <header className="header">
      <div className="header-in">
        <Link className="logo" to="/" aria-label="Shopping Karo home">
          <span className="logo-mark" aria-hidden="true">🛍️</span>
          <span>shopping<em>karo</em></span>
        </Link>

        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder='Ask for anything — try "gift for dad under 1000"'
            aria-label="Search products"
          />
          <button type="submit" className="btn btn-primary">Find</button>
        </form>

        <div className="header-actions">
          <button className="pin" type="button" title="Change delivery pincode">
            <span aria-hidden="true">📍</span>
            <span><b>122001</b> Gurgaon</span>
          </button>
          {authReady && (user ? <AccountMenu user={user} onLogout={onLogout} /> : <button className="btn btn-dark" onClick={onSignIn}>Sign in</button>)}
          <button className="icon-btn" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {!user?.roles.includes('ADMIN') && (
            <button className="icon-btn cart-btn" onClick={onOpenCart} aria-label={`Open cart, ${cartCount} items`}>
              🛒
              {cartCount > 0 && <span className="badge">{cartCount}</span>}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function AccountMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const isAdmin = user.roles.includes('ADMIN');

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="account" ref={box}>
      {isAdmin && <Link className="admin-link" to="/admin">Admin</Link>}
      <button className="account-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span>
        <span className="account-name">Hi, {user.name.split(' ')[0]}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-who"><b>{user.name}</b><small>{user.email}</small></div>
          {isAdmin ? (
            // The admin account runs the store; it has no orders or delivery addresses of its own.
            <button role="menuitem" onClick={() => go('/admin')}>📊 Admin dashboard</button>
          ) : (
            <>
              <button role="menuitem" onClick={() => go('/orders')}>📦 Your orders</button>
              <button role="menuitem" onClick={() => go('/account/addresses')}>📍 Your addresses</button>
            </>
          )}
          <hr />
          <button role="menuitem" onClick={() => { setOpen(false); onLogout(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
