import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminOrderApi, catalogApi } from '../../api';
import { StatusBadge } from '../../components/StatusBadge';
import { STATUS_LABEL, STATUS_ORDER, type Order, type OrderStats } from '../../data/orders';
import type { Product } from '../../data/products';
import { ApiError } from '../../http';
import { formatINR, timeAgo } from '../../lib';
import { useOrderStream } from '../../stream';

const LOW_STOCK = 5;

export default function AdminOverview() {
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    try {
      const [s, page, p] = await Promise.all([adminOrderApi.stats(), adminOrderApi.list({ size: 6 }), catalogApi.adminList()]);
      setStats(s);
      setRecent(page.items);
      setProducts(p);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the order or product service. Are they running on ports 8085 and 8082?");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A burst of events refreshes the numbers once, shortly after the last one.
  const live = useOrderStream('/api/admin/orders/stream', true, () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 600);
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const active = products.filter((p) => p.status === 'ACTIVE');
  const outOfStock = active.filter((p) => p.stock === 0);
  const lowStock = active.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK).sort((a, b) => a.stock - b.stock);
  const units = active.reduce((n, p) => n + p.stock, 0);
  const stockValue = active.reduce((n, p) => n + p.stock * p.price, 0);
  const maxCount = Math.max(1, ...STATUS_ORDER.map((s) => stats?.byStatus[s] ?? 0));

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Overview</h1>
          <p className="muted"><span className={`live ${live ? 'live-on' : ''}`} aria-hidden="true" /> {live ? 'Live' : 'Connecting…'} · numbers update as orders arrive</p>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="stat-grid">
        <Stat label="Orders today" value={stats ? String(stats.ordersToday) : '…'} />
        <Stat label="Revenue today" value={stats ? formatINR(stats.revenueToday) : '…'} />
        <Stat label="Revenue, all time" value={stats ? formatINR(stats.revenueTotal) : '…'} />
        <Stat label="Need your attention" value={stats ? String(stats.needAttention) : '…'} hint="confirmed or packed, not yet shipped" tone={stats && stats.needAttention > 0 ? 'warn' : undefined} to="/admin/orders" />
      </div>

      <div className="two-col">
        <section className="panel">
          <h2>Orders by status</h2>
          {STATUS_ORDER.map((s) => {
            const n = stats?.byStatus[s] ?? 0;
            return (
              <div key={s} className="bar-row">
                <span>{STATUS_LABEL[s]}</span>
                <div className="bar"><span className={`bar-fill st-${s.toLowerCase()}`} style={{ width: `${(n / maxCount) * 100}%` }} /></div>
                <b>{n}</b>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <h2>Inventory</h2>
          <div className="inv-numbers">
            <div><b>{active.length}</b><span>products on sale</span></div>
            <div><b>{units.toLocaleString('en-IN')}</b><span>units in stock</span></div>
            <div><b>{formatINR(stockValue)}</b><span>stock value</span></div>
          </div>
          {outOfStock.length > 0 && <p className="form-error">{outOfStock.length} product{outOfStock.length > 1 ? 's are' : ' is'} out of stock.</p>}
          {lowStock.length === 0 && outOfStock.length === 0 ? (
            <p className="muted">Everything is well stocked.</p>
          ) : (
            <ul className="low-list">
              {[...outOfStock, ...lowStock].slice(0, 6).map((p) => (
                <li key={p.id}><span aria-hidden="true">{p.emoji}</span><b>{p.title}</b><span className={p.stock === 0 ? 'low' : 'warn-text'}>{p.stock === 0 ? 'Out of stock' : `${p.stock} left`}</span></li>
              ))}
            </ul>
          )}
          <Link className="link" to="/admin/products">Manage products &amp; stock →</Link>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Latest orders</h2><Link className="link" to="/admin/orders">All orders →</Link></div>
        {recent.length === 0 ? (
          <p className="muted">No orders yet. They will appear here the moment a customer checks out.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((o) => (
              <li key={o.id}>
                <b>{o.orderNumber}</b>
                <span className="muted">{o.userEmail}</span>
                <span>{formatINR(o.total)}</span>
                <StatusBadge status={o.status} />
                <span className="muted">{timeAgo(o.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, hint, tone, to }: { label: string; value: string; hint?: string; tone?: 'warn'; to?: string }) {
  const body = (
    <>
      <span>{label}</span>
      <b>{value}</b>
      {hint && <small>{hint}</small>}
    </>
  );
  return to ? <Link to={to} className={`stat ${tone ? `stat-${tone}` : ''}`}>{body}</Link> : <div className={`stat ${tone ? `stat-${tone}` : ''}`}>{body}</div>;
}
