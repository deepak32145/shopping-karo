import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderApi } from '../api';
import type { User } from '../auth';
import { PaymentBadge, StatusBadge } from '../components/StatusBadge';
import type { Order } from '../data/orders';
import { ApiError } from '../http';
import { formatDate, formatINR, plural } from '../lib';
import { useOrderStream } from '../stream';

interface Props {
  user: User | null;
  authReady: boolean;
  onSignIn: () => void;
}

export default function OrdersPage({ user, authReady, onSignIn }: Props) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await orderApi.list());
    } catch (err) {
      setOrders([]);
      setError(err instanceof ApiError ? err.message : "Can't reach the order service. Is it running on port 8085?");
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  // Status changes made by the store show up here without a refresh.
  const live = useOrderStream('/api/orders/stream', user !== null, (_type, order) =>
    setOrders((cur) => {
      if (!cur) return cur;
      return cur.some((o) => o.id === order.id) ? cur.map((o) => (o.id === order.id ? order : o)) : [order, ...cur];
    }),
  );

  if (!authReady) return <main className="page"><p className="muted">Loading…</p></main>;
  if (!user) {
    return (
      <main className="page">
        <div className="empty"><h2>Your orders</h2><p>Sign in to see your orders.</p><button className="btn btn-dark" onClick={onSignIn}>Sign in</button></div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="admin-head">
        <div>
          <h1>Your orders</h1>
          <p className="muted"><span className={`live ${live ? 'live-on' : ''}`} aria-hidden="true" /> {live ? 'Live: status changes appear here instantly' : 'Connecting for live updates…'}</p>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {orders === null ? (
        <div className="order-list">{Array.from({ length: 3 }, (_, i) => <div key={i} className="card skeleton order-skeleton" />)}</div>
      ) : orders.length === 0 ? (
        <div className="empty"><p>You haven't ordered anything yet.</p><Link className="btn btn-dark" to="/">Start shopping</Link></div>
      ) : (
        <div className="order-list">
          {orders.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`} className="order-card">
              <div className="oc-top">
                <b>{o.orderNumber}</b>
                <span className="muted">{formatDate(o.createdAt)}</span>
                <StatusBadge status={o.status} />
              </div>
              <div className="oc-items" aria-hidden="true">
                {o.items.slice(0, 6).map((i) => <span key={i.productId} title={i.title}>{i.emoji}</span>)}
                {o.items.length > 6 && <small>+{o.items.length - 6}</small>}
              </div>
              <div className="oc-bottom">
                <span className="muted">{plural(o.items.reduce((n, i) => n + i.qty, 0), "item")} · <PaymentBadge status={o.payment.status} /></span>
                <b>{formatINR(o.total)}</b>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
