import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addressApi, orderApi } from '../api';
import type { User } from '../auth';
import AddressForm from '../components/AddressForm';
import PaymentModal from '../components/PaymentModal';
import { shippingFor, type Address, type Order } from '../data/orders';
import type { Product } from '../data/products';
import { ApiError } from '../http';
import { addressLines, formatINR } from '../lib';
import type { CartLine } from '../useCart';

interface Props {
  user: User | null;
  authReady: boolean;
  onSignIn: () => void;
  lines: CartLine[];
  products: Product[];
  /** The order is paid and the server emptied the cart: mirror that in the browser. */
  onPlaced: () => void;
}

export default function Checkout({ user, authReady, onSignIn, lines, products, onPlaced }: Props) {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<Address | 'new' | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Order | null>(null); // an order created but not paid yet
  const [paying, setPaying] = useState(false);

  const rows = useMemo(() => lines.map((line) => ({ line, product: products.find((p) => p.id === line.id) })), [lines, products]);
  const items = rows.filter((r): r is { line: CartLine; product: Product } => r.product?.status === 'ACTIVE');
  const unavailable = rows.length - items.length;
  const subtotal = items.reduce((sum, r) => sum + r.product.price * r.line.qty, 0);
  const shipping = shippingFor(subtotal);

  const loadAddresses = useCallback(async (preferId?: string) => {
    try {
      const list = await addressApi.list();
      setAddresses(list);
      setSelected((cur) => preferId ?? (cur && list.some((a) => a.id === cur) ? cur : (list.find((a) => a.isDefault) ?? list[0])?.id ?? null));
      if (list.length === 0) setForm('new');
    } catch (err) {
      setAddresses([]);
      setError(err instanceof ApiError ? err.message : "Can't reach the address service. Is it running on port 8084?");
    }
  }, []);

  useEffect(() => {
    if (user) void loadAddresses();
  }, [user, loadAddresses]);

  if (!authReady) return <main className="page"><p className="muted">Loading…</p></main>;
  if (!user) {
    return (
      <main className="page">
        <div className="empty"><h2>Checkout</h2><p>Sign in to place your order.</p><button className="btn btn-dark" onClick={onSignIn}>Sign in</button></div>
      </main>
    );
  }
  if (items.length === 0 && !waiting) {
    return (
      <main className="page">
        <div className="empty"><h2>Your cart is empty</h2><p>Add something you like, then come back to check out.</p><Link className="btn btn-dark" to="/">Continue shopping</Link></div>
      </main>
    );
  }

  const place = async () => {
    if (!selected) return;
    setError(null);
    setPlacing(true);
    try {
      const order = await orderApi.checkout(selected);
      setWaiting(order);
      setPaying(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't place your order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const paid = (order: Order) => {
    setPaying(false);
    onPlaced();
    navigate(`/orders/${order.id}`, { replace: true, state: { justPlaced: true } });
  };

  const cancelWaiting = async () => {
    if (!waiting) return;
    try {
      await orderApi.cancel(waiting.id);
      setWaiting(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel the order.');
    }
  };

  const chosen = addresses?.find((a) => a.id === selected);

  return (
    <main className="page">
      <h1>Checkout</h1>

      {error && <p className="form-error" role="alert">{error} {error.toLowerCase().includes('stock') || error.toLowerCase().includes('left') ? <Link to="/">Back to the store</Link> : null}</p>}

      {waiting && !paying && (
        <div className="panel panel-warn" role="status">
          <b>Order {waiting.orderNumber} is waiting for payment.</b>
          <p className="muted">We're holding your items for a few minutes.</p>
          <div className="pf-actions">
            <button className="btn btn-ghost" onClick={cancelWaiting}>Cancel order</button>
            <button className="btn btn-primary" onClick={() => setPaying(true)}>Pay now</button>
          </div>
        </div>
      )}

      <div className="checkout-grid">
        <section aria-labelledby="ship-title">
          <h2 id="ship-title" className="step-title"><span className="step-n">1</span> Delivery address</h2>

          {addresses === null ? (
            <p className="muted">Loading your addresses…</p>
          ) : (
            <>
              <div className="addr-grid addr-pick">
                {addresses.map((a) => (
                  <label key={a.id} className={`addr-card addr-radio ${selected === a.id ? 'addr-selected' : ''}`}>
                    <input type="radio" name="address" checked={selected === a.id} onChange={() => setSelected(a.id)} />
                    <div>
                      <div className="addr-top">
                        <b>{a.fullName}</b>
                        {a.isDefault && <span className="tag">Default</span>}
                      </div>
                      <p>{addressLines(a)}</p>
                      <p className="muted">Mobile: {a.phone}</p>
                      <button type="button" className="link" onClick={(e) => { e.preventDefault(); setForm(a); }}>Edit</button>
                    </div>
                  </label>
                ))}
              </div>

              {form === null ? (
                <button className="btn btn-ghost" onClick={() => setForm('new')}>+ Add a new address</button>
              ) : (
                <div className="panel">
                  <AddressForm
                    address={form === 'new' ? null : form}
                    isFirst={addresses.length === 0}
                    onSaved={(saved) => { setForm(null); void loadAddresses(saved.id); }}
                    onCancel={() => setForm(null)}
                  />
                </div>
              )}
            </>
          )}

          <h2 className="step-title"><span className="step-n">2</span> Review items</h2>
          {unavailable > 0 && <p className="form-error">{unavailable} item{unavailable > 1 ? 's' : ''} in your cart {unavailable > 1 ? 'are' : 'is'} no longer available and won't be ordered. Remove {unavailable > 1 ? 'them' : 'it'} from the cart to continue.</p>}
          <ul className="co-items">
            {items.map(({ line, product: p }) => (
              <li key={p.id}>
                <span className="line-emoji" aria-hidden="true">{p.emoji}</span>
                <div className="line-info"><b>{p.title}</b><span>{p.seller} · Qty {line.qty}</span></div>
                <b>{formatINR(p.price * line.qty)}</b>
              </li>
            ))}
          </ul>
        </section>

        <aside className="panel co-summary" aria-label="Order summary">
          <h2>Order summary</h2>
          <dl>
            <div><dt>Items ({items.reduce((n, r) => n + r.line.qty, 0)})</dt><dd>{formatINR(subtotal)}</dd></div>
            <div><dt>Delivery</dt><dd>{shipping === 0 ? <span className="free">FREE</span> : formatINR(shipping)}</dd></div>
            <div className="co-total"><dt>Total</dt><dd>{formatINR(subtotal + shipping)}</dd></div>
          </dl>
          {chosen && <p className="muted co-ship-to">Delivering to <b>{chosen.fullName}</b>, {chosen.city} {chosen.pincode}</p>}
          <button className="btn btn-primary btn-block" onClick={place} disabled={!selected || placing || unavailable > 0 || items.length === 0 || waiting !== null}>
            {placing ? 'Placing order…' : 'Place order & pay'}
          </button>
          <p className="muted co-note">The final amount is confirmed when you place the order. Items are held for 15 minutes while you pay.</p>
        </aside>
      </div>

      {paying && waiting && (
        <PaymentModal
          order={waiting}
          onPaid={paid}
          onClose={() => setPaying(false)}
          onOrderGone={(message) => { setPaying(false); setWaiting(null); setError(message); }}
        />
      )}
    </main>
  );
}
