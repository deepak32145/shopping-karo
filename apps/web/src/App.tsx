import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import AssistantChat from './components/AssistantChat';
import AuthDialog, { AuthMode } from './components/AuthDialog';
import CartDrawer from './components/CartDrawer';
import Footer from './components/Footer';
import Header from './components/Header';
import AddressBook from './pages/AddressBook';
import AdminLayout from './pages/admin/AdminLayout';
import AdminOrders from './pages/admin/AdminOrders';
import AdminOverview from './pages/admin/AdminOverview';
import AdminProducts from './pages/admin/AdminProducts';
import Checkout from './pages/Checkout';
import Home from './pages/Home';
import OrderPage from './pages/OrderPage';
import OrdersPage from './pages/OrdersPage';
import { useCart } from './useCart';
import { useProducts } from './useProducts';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('sk-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const auth = useAuth();
  const catalogue = useProducts();
  // The admin account runs the store, it does not shop: no cart, no checkout, no orders or addresses of its own.
  const isAdmin = auth.user?.roles.includes('ADMIN') ?? false;
  const cart = useCart(isAdmin ? null : auth.user, auth.ready); // null user: no saved cart is fetched or created for the admin
  /** Customer pages send the admin to the dashboard instead. */
  const shopperOnly = (page: ReactElement) => (isAdmin ? <Navigate to="/admin" replace /> : page);
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  // True while a sign-in dialog is open, so that the admin account lands on the dashboard right after signing in
  // (but a page reload, which silently restores the session, does not move anyone).
  const signingIn = useRef(false);
  const afterSignIn = useRef<string | null>(null);

  const openSignIn = (then?: string) => {
    signingIn.current = true;
    afterSignIn.current = then ?? null;
    setAuthMode('login');
  };

  useEffect(() => {
    if (authMode) signingIn.current = true; // covers dialogs opened by other routes, e.g. the emailed reset link
  }, [authMode]);

  useEffect(() => {
    if (!signingIn.current || !auth.user) return;
    signingIn.current = false;
    const target = afterSignIn.current ?? (auth.user.roles.includes('ADMIN') ? '/admin' : null);
    afterSignIn.current = null;
    if (target) navigate(target);
  }, [auth.user, navigate]);

  // Opening the emailed link (/?reset=<token>) shows the "choose a new password" dialog.
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('reset');
    if (!token) return;
    setResetToken(token);
    setAuthMode('reset');
    navigate(location.pathname, { replace: true }); // keep the token out of the address bar
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('sk-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // The search box belongs to the storefront: do not carry its text onto the cart, orders or admin pages.
  useEffect(() => {
    if (location.pathname !== '/') setQuery('');
  }, [location.pathname]);

  // Leaving a page should not leave you scrolled halfway down the next one.
  useEffect(() => {
    if (!location.search.includes('category=')) window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  const addToCart = (id: string) => {
    cart.add(id);
    setCartOpen(true);
  };

  // Count only items that still exist in the store; the drawer lists the rest as "no longer available".
  const cartCount = cart.lines.reduce((n, l) => (catalogue.products.some((p) => p.id === l.id) ? n + l.qty : n), 0);

  const search = () => {
    if (location.pathname !== '/') navigate('/');
    setTimeout(() => document.getElementById('picks')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const checkout = () => {
    setCartOpen(false);
    if (auth.user) navigate('/checkout');
    else openSignIn('/checkout');
  };

  const signIn = () => openSignIn();

  return (
    <>
      <Header
        user={auth.user}
        authReady={auth.ready}
        onSignIn={signIn}
        onLogout={() => {
          void auth.logout();
          if (/^\/(admin|orders|checkout|account)/.test(location.pathname)) navigate('/');
        }}
        query={query}
        onQuery={setQuery}
        onSubmit={search}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      />

      <Routes>
        <Route
          path="/"
          element={
            <Home
              products={catalogue.products}
              loading={catalogue.loading}
              error={catalogue.error}
              onRetry={() => void catalogue.reload()}
              query={query}
              onQuery={setQuery}
              onAdd={isAdmin ? undefined : addToCart}
            />
          }
        />
        <Route
          path="/checkout"
          element={shopperOnly(
            <Checkout
              user={auth.user}
              authReady={auth.ready}
              onSignIn={signIn}
              lines={cart.lines}
              products={catalogue.products}
              onPlaced={() => {
                cart.clearLocal();
                void catalogue.reload(); // stock has changed
              }}
            />,
          )}
        />
        <Route path="/orders" element={shopperOnly(<OrdersPage user={auth.user} authReady={auth.ready} onSignIn={signIn} />)} />
        <Route
          path="/orders/:id"
          element={shopperOnly(
            <OrderPage user={auth.user} authReady={auth.ready} onSignIn={signIn} onPaidHere={() => { cart.clearLocal(); void catalogue.reload(); }} />,
          )}
        />
        <Route path="/account/addresses" element={shopperOnly(<AddressBook user={auth.user} authReady={auth.ready} onSignIn={signIn} />)} />

        <Route path="/admin" element={<AdminLayout user={auth.user} authReady={auth.ready} onSignIn={signIn} />}>
          <Route index element={<AdminOverview />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="products" element={<AdminProducts onCatalogChanged={() => void catalogue.reload()} />} />
        </Route>

        <Route
          path="*"
          element={
            <main className="admin">
              <div className="empty">
                <h2>Page not found</h2>
                <Link className="btn btn-dark" to="/">Back to the store</Link>
              </div>
            </main>
          }
        />
      </Routes>

      <Footer />
      <AuthDialog
        mode={authMode}
        onMode={setAuthMode}
        onClose={() => setAuthMode(null)}
        onLogin={auth.login}
        onRegister={auth.register}
        onVerify={auth.verifyEmail}
        onResend={auth.resendOtp}
        onGoogle={auth.googleLogin}
        onForgot={auth.forgotPassword}
        onReset={async (newPassword) => {
          await auth.resetPassword(resetToken!, newPassword);
          setResetToken(null); // link is single use
        }}
      />
      {!isAdmin && <AssistantChat userId={auth.user?.id ?? null} />}
      {!isAdmin && (
        <CartDrawer
          open={cartOpen}
          lines={cart.lines}
          products={catalogue.products}
          error={cart.error}
          signedIn={auth.user !== null}
          onClose={() => setCartOpen(false)}
          onChangeQty={cart.change}
          onSignIn={() => {
            setCartOpen(false);
            openSignIn();
          }}
          onCheckout={checkout}
        />
      )}
    </>
  );
}
