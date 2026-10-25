import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { orderApi } from '../api';
import type { User } from '../auth';
import OrderTimeline from '../components/OrderTimeline';
import PaymentModal from '../components/PaymentModal';
import { PaymentBadge, StatusBadge } from '../components/StatusBadge';
import { CUSTOMER_CAN_CANCEL, type Order } from '../data/orders';
import { ApiError } from '../http';
import { addressLines, formatDateTime, formatINR } from '../lib';
import { useOrderStream } from '../stream';

interface Props {
  user: User | null;
  authReady: boolean;
  onSignIn: () => void;
  onPaidHere: () => void;
}

export default function OrderPage({ user, authReady, onSignIn, onPaidHere }: Props) {
  const { id = '' } = useParams();
  const justPlaced = Boolean((useLocation().state as { justPlaced?: boolean } | null)?.justPlaced);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrder(await orderApi.get(id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof ApiError ? err.message : "Can't reach the order service. Is it running on port 8085?");
    }
  }, [id]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useOrderStream('/api/orders/stream', user !== null, (_t, updated) => {
    if (updated.id === id) setOrder(updated);
  });

  if (!authReady) return <main className="page"><p className="muted">Loading…</p></main>;
  if (!user) {
    return <main className="page"><div className="empty"><h2>Your order</h2><p>Sign in to view this order.</p><button className="btn btn-dark" onClick={onSignIn}>Sign in</button></div></main>;
  }
  if (notFound) {
    return <main className="page"><div className="empty"><h2>Order not found</h2><Link className="btn btn-dark" to="/orders">Your orders</Link></div></main>;
  }
  if (!order) return <main className="page">{error ? <p className="form-error">{error}</p> : <p className="muted">Loading order…</p>}</main>;

  const cancel = async () => {
    if (!window.confirm('Cancel this order?')) return;
    setBusy(true);
    setError(null);
    try {
      setOrder(await orderApi.cancel(order.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel the order.');
    } finally {
      setBusy(false);
    }
  };

  const canPay = order.status === 'PAYMENT_PENDING' && (!order.expiresAt || new Date(order.expiresAt).getTime() > Date.now());

  return (
    <main className="page">
      {justPlaced && order.status !== 'CANCELLED' && (
        <div className="panel panel-ok" role="status">
          <h2>🎉 Order placed. Thank you!</h2>
          <p>{order.payment.status === 'PAY_ON_DELIVERY' ? `Pay ${formatINR(order.total)} in cash on delivery.` : 'Your payment was received.'} We'll update this page as your order moves along.</p>
        </div>
      )}

      <div className="admin-head">
        <div>
          <h1>Order {order.orderNumber}</h1>
          <p className="muted">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <OrderTimeline order={order} />

      {(canPay || CUSTOMER_CAN_CANCEL.includes(order.status)) && (
        <div className="pf-actions order-actions">
          {CUSTOMER_CAN_CANCEL.includes(order.status) && <button className="btn btn-ghost" onClick={cancel} disabled={busy}>Cancel order</button>}
          {canPay && <button className="btn btn-primary" onClick={() => setPaying(true)}>Pay {formatINR(order.total)}</button>}
        </div>
      )}

      <div className="order-grid">
        <section className="panel">
          <h2>Items</h2>
          <ul className="co-items">
            {order.items.map((i) => (
              <li key={i.productId}>
                <span className="line-emoji" aria-hidden="true">{i.emoji}</span>
                <div className="line-info"><b>{i.title}</b><span>{i.seller} · {formatINR(i.unitPrice)} × {i.qty}</span></div>
                <b>{formatINR(i.lineTotal)}</b>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <div><dt>Items</dt><dd>{formatINR(order.subtotal)}</dd></div>
            <div><dt>Delivery</dt><dd>{order.shipping === 0 ? 'FREE' : formatINR(order.shipping)}</dd></div>
            <div className="co-total"><dt>Total</dt><dd>{formatINR(order.total)}</dd></div>
          </dl>
        </section>

        <div className="stack">
          <section className="panel">
            <h2>Delivery address</h2>
            <b>{order.address.fullName}</b>
            <p>{addressLines(order.address)}</p>
            <p className="muted">Mobile: {order.address.phone}</p>
          </section>
          <section className="panel">
            <h2>Payment</h2>
            <p><PaymentBadge status={order.payment.status} /> {order.payment.detail && <span className="muted">{order.payment.detail}</span>}</p>
            {order.payment.failureReason && order.payment.status === 'FAILED' && <p className="form-error">{order.payment.failureReason}</p>}
          </section>
        </div>
      </div>

      {paying && (
        <PaymentModal
          order={order}
          onPaid={(paid) => { setPaying(false); setOrder(paid); onPaidHere(); }}
          onClose={() => setPaying(false)}
          onOrderGone={(m) => { setPaying(false); setError(m); void load(); }}
        />
      )}
    </main>
  );
}
