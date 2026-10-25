import { useCallback, useEffect, useRef, useState } from 'react';
import { adminOrderApi } from '../../api';
import OrderTimeline from '../../components/OrderTimeline';
import { PaymentBadge, StatusBadge } from '../../components/StatusBadge';
import { ADMIN_NEXT, STATUS_LABEL, STATUS_ORDER, type Order, type OrderStats, type OrderStatus } from '../../data/orders';
import { ApiError } from '../../http';
import { addressLines, formatINR, timeAgo } from '../../lib';
import { useOrderStream, type OrderEventType } from '../../stream';

const PAGE_SIZE = 25;

function useTicker(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function AdminOrders() {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const now = useTicker(30_000);
  const view = useRef({ status, query, page });
  view.current = { status, query, page };

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const refreshStats = useCallback(() => adminOrderApi.stats().then(setStats).catch(() => undefined), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminOrderApi.list({ status, q: query, page, size: PAGE_SIZE });
      setOrders(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the order service. Is it running on port 8085?");
    } finally {
      setLoading(false);
    }
  }, [status, query, page]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const flash = (id: string) => {
    setFresh((s) => new Set(s).add(id));
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n; }), 4000);
  };

  // Live: apply each event to what is on screen.
  const live = useOrderStream('/api/admin/orders/stream', true, (type: OrderEventType, order) => {
    const { status: st, query: q, page: pg } = view.current;
    const matches = (st === null || order.status === st) && (!q || `${order.orderNumber} ${order.userEmail} ${order.address.fullName}`.toLowerCase().includes(q.toLowerCase()));
    setOrders((cur) => {
      const exists = cur.some((o) => o.id === order.id);
      if (exists && matches) return cur.map((o) => (o.id === order.id ? order : o));
      if (exists && !matches) return cur.filter((o) => o.id !== order.id); // moved out of this filter
      if (!exists && matches && pg === 0) return [order, ...cur].slice(0, PAGE_SIZE);
      return cur;
    });
    setSelected((s) => (s && s.id === order.id ? order : s));
    flash(order.id);
    if (type === 'ORDER_CREATED') setToast(`New order ${order.orderNumber}: ${formatINR(order.total)}`);
    void refreshStats();
    // totals and page boundaries can shift, so re-count quietly
    void adminOrderApi.list({ status: st, q, page: pg, size: PAGE_SIZE }).then((r) => setTotal(r.total)).catch(() => undefined);
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const move = async (order: Order, to: OrderStatus, danger?: boolean) => {
    let note: string | undefined;
    if (danger) {
      const reason = window.prompt(`Cancel ${order.orderNumber}? ${order.payment.status === 'PAID' ? 'The customer will be refunded and the stock restored.' : 'The stock will be restored.'}\n\nReason (optional):`);
      if (reason === null) return;
      note = reason.trim() || undefined;
    }
    setError(null);
    try {
      const updated = await adminOrderApi.setStatus(order.id, to, note);
      setOrders((cur) => cur.map((o) => (o.id === updated.id ? updated : o)));
      setSelected((s) => (s && s.id === updated.id ? updated : s));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the order.');
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Orders</h1>
          <p className="muted"><span className={`live ${live ? 'live-on' : ''}`} aria-hidden="true" /> {live ? 'Live: new orders and changes appear instantly' : 'Connecting for live updates…'}</p>
        </div>
      </div>

      <div className="admin-tools">
        <input className="admin-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order number, email or name" aria-label="Search orders" />
        <div className="presets">
          <button className={`pill ${status === null ? 'pill-on' : ''}`} onClick={() => { setStatus(null); setPage(0); }}>All</button>
          {STATUS_ORDER.map((s) => (
            <button key={s} className={`pill ${status === s ? 'pill-on' : ''}`} onClick={() => { setStatus(s); setPage(0); }}>
              {STATUS_LABEL[s]}{stats?.byStatus[s] ? ` · ${stats.byStatus[s]}` : ''}
            </button>
          ))}
        </div>
      </div>

      {toast && <p className="form-ok live-toast" role="status">🔔 {toast}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {loading && orders.length === 0 ? (
        <p className="muted">Loading orders…</p>
      ) : orders.length === 0 ? (
        <div className="empty"><p>{status || query ? 'No orders match these filters.' : 'No orders yet. They appear here the moment a customer checks out.'}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table orders-table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th className="num">Items</th><th className="num">Total</th><th>Payment</th><th>Status</th><th>Placed</th><th /></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={`${fresh.has(o.id) ? 'row-fresh' : ''} ${selected?.id === o.id ? 'row-selected' : ''}`}>
                  <td><button className="link order-link" onClick={() => setSelected(o)}>{o.orderNumber}</button></td>
                  <td>{o.address.fullName}<br /><small className="muted">{o.userEmail}</small></td>
                  <td className="num">{o.items.reduce((n, i) => n + i.qty, 0)}</td>
                  <td className="num">{formatINR(o.total)}</td>
                  <td><PaymentBadge status={o.payment.status} /></td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="muted">{timeAgo(o.createdAt, now)}</td>
                  <td className="actions">
                    <div className="act">
                      {ADMIN_NEXT[o.status].map((a) => (
                        <button key={a.to} className={a.danger ? 'link danger' : 'btn btn-dark btn-sm'} onClick={() => void move(o, a.to, a.danger)}>{a.label}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Newer</button>
          <span className="muted">Page {page + 1} of {pages} · {total} orders</span>
          <button className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Older →</button>
        </div>
      )}

      {selected && (
        <>
          <div className="scrim scrim-on" onClick={() => setSelected(null)} />
          <aside className="drawer drawer-wide drawer-on" aria-label={`Order ${selected.orderNumber}`}>
            <div className="drawer-head">
              <div>
                <h2>{selected.orderNumber}</h2>
                <StatusBadge status={selected.status} />
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close">✕</button>
            </div>
            <div className="drawer-body">
              <p><b>{selected.address.fullName}</b> · {selected.userEmail}</p>
              <p className="muted">{addressLines(selected.address)} · Mobile {selected.address.phone}</p>

              <div className="pf-actions drawer-actions">
                {ADMIN_NEXT[selected.status].length === 0 && <span className="muted">No further actions: this order is {STATUS_LABEL[selected.status].toLowerCase()}.</span>}
                {ADMIN_NEXT[selected.status].map((a) => (
                  <button key={a.to} className={a.danger ? 'btn btn-ghost danger' : 'btn btn-primary'} onClick={() => void move(selected, a.to, a.danger)}>{a.label}</button>
                ))}
              </div>

              <OrderTimeline order={selected} />

              <h3>Items</h3>
              <ul className="co-items">
                {selected.items.map((i) => (
                  <li key={i.productId}>
                    <span className="line-emoji" aria-hidden="true">{i.emoji}</span>
                    <div className="line-info"><b>{i.title}</b><span>{i.seller} · {formatINR(i.unitPrice)} × {i.qty}</span></div>
                    <b>{formatINR(i.lineTotal)}</b>
                  </li>
                ))}
              </ul>
              <dl className="totals">
                <div><dt>Items</dt><dd>{formatINR(selected.subtotal)}</dd></div>
                <div><dt>Delivery</dt><dd>{selected.shipping === 0 ? 'FREE' : formatINR(selected.shipping)}</dd></div>
                <div className="co-total"><dt>Total</dt><dd>{formatINR(selected.total)}</dd></div>
              </dl>
              <p><PaymentBadge status={selected.payment.status} /> <span className="muted">{selected.payment.detail}</span></p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
