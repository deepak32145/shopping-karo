import { useCallback, useEffect, useMemo, useState } from 'react';
import { catalogApi } from '../../api';
import { categories, type CategoryId } from '../../data/categories';
import type { Product, ProductStatus } from '../../data/products';
import { ApiError } from '../../http';
import { formatINR } from '../../lib';
import ProductForm from '../ProductForm';

interface Props {
  /** Called after any change so the storefront catalogue refreshes. */
  onCatalogChanged: () => void;
}

const STATUS_LABEL: Record<ProductStatus, string> = { ACTIVE: 'Active', DRAFT: 'Draft', ARCHIVED: 'Archived' };
const LOW_STOCK = 5;

export default function AdminProducts({ onCatalogChanged }: Props) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProductStatus | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | 'ALL'>('ALL');
  const [stockOnly, setStockOnly] = useState<'ALL' | 'LOW'>('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await catalogApi.adminList());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the product service. Is it running on port 8082?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (p) =>
        (filter === 'ALL' || p.status === filter) &&
        (categoryFilter === 'ALL' || p.category === categoryFilter) &&
        (stockOnly === 'ALL' || (p.status === 'ACTIVE' && p.stock <= LOW_STOCK)) &&
        (!q || `${p.title} ${p.seller}`.toLowerCase().includes(q)),
    );
  }, [items, filter, categoryFilter, stockOnly, search]);

  const active = items.filter((p) => p.status === 'ACTIVE');
  const lowCount = active.filter((p) => p.stock <= LOW_STOCK).length;
  const units = active.reduce((n, p) => n + p.stock, 0);

  const saved = (p: Product) => {
    setEditing(null);
    setFlash(`“${p.title}” saved.`);
    void load();
    onCatalogChanged();
  };

  const setStatus = async (p: Product, status: ProductStatus) => {
    setError(null);
    try {
      if (status === 'ARCHIVED') await catalogApi.archive(p.id);
      else await catalogApi.update(p.id, {
        title: p.title, seller: p.seller, price: p.price, mrp: p.mrp, stock: p.stock, emoji: p.emoji, hue: p.hue, category: p.category,
        moments: p.moments, keywords: p.keywords, status,
        deal: p.deal ? { endsInHours: Math.max(0.1, (new Date(p.deal.endsAt).getTime() - Date.now()) / 3_600_000), claimedPct: p.deal.claimedPct } : null,
      });
      setFlash(`“${p.title}” ${status === 'ARCHIVED' ? 'archived' : 'restored'}.`);
      void load();
      onCatalogChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the product.');
    }
  };

  const changeStock = async (p: Product, stock: number) => {
    if (stock === p.stock) return;
    setError(null);
    try {
      const updated = await catalogApi.setStock(p.id, stock);
      setItems((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
      setFlash(`Stock for “${p.title}” set to ${stock}.`);
      onCatalogChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the stock.');
      void load();
    }
  };

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Products &amp; stock</h1>
          <p className="muted">{active.length} on sale · {units.toLocaleString('en-IN')} units in stock · changes appear in the store straight away.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add product</button>
      </div>

      <div className="admin-tools">
        <input className="admin-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or seller" aria-label="Search products" />
        <div className="presets">
          {(['ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED'] as const).map((s) => (
            <button key={s} className={`pill ${filter === s ? 'pill-on' : ''}`} onClick={() => setFilter(s)}>
              {s === 'ALL' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
          <button className={`pill ${stockOnly === 'LOW' ? 'pill-on' : ''}`} onClick={() => setStockOnly((s) => (s === 'LOW' ? 'ALL' : 'LOW'))}>
            ⚠ Low stock{lowCount > 0 ? ` · ${lowCount}` : ''}
          </button>
        </div>
        <select className="admin-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryId | 'ALL')} aria-label="Filter by category">
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {flash && <p className="form-ok" role="status">{flash}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {loading ? (
        <p className="muted">Loading products…</p>
      ) : shown.length === 0 ? (
        <div className="empty"><p>{items.length === 0 ? 'No products yet. Add your first one.' : 'No products match.'}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Product</th><th>Category</th><th>Seller</th><th className="num">Price</th><th className="num">Stock</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={p.status === 'ARCHIVED' ? 'row-archived' : ''}>
                  <td>
                    <span className="row-emoji" aria-hidden="true" style={{ ['--hue' as string]: p.hue }}>{p.emoji}</span>
                    <b>{p.title}</b>
                    {p.deal && <span className="tag">Deal</span>}
                  </td>
                  <td className="cat-cell">{categories.find((c) => c.id === p.category)?.label ?? p.category}</td>
                  <td>{p.seller}</td>
                  <td className="num">{formatINR(p.price)}<small className="muted"> / {formatINR(p.mrp)}</small></td>
                  <td className="num">
                    <StockCell product={p} onCommit={(n) => void changeStock(p, n)} />
                  </td>
                  <td><span className={`status status-${p.status.toLowerCase()}`}>{STATUS_LABEL[p.status]}</span></td>
                  <td className="actions">
                    <button className="link" onClick={() => setEditing(p)}>Edit</button>
                    {p.status === 'ARCHIVED' ? (
                      <button className="link" onClick={() => void setStatus(p, 'ACTIVE')}>Restore</button>
                    ) : (
                      <button className="link danger" onClick={() => void setStatus(p, 'ARCHIVED')}>Archive</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <ProductForm product={editing === 'new' ? null : editing} onSaved={saved} onCancel={() => setEditing(null)} />}
    </>
  );
}

/** A number box that saves when you press Enter or leave it, so restocking is one quick edit. */
function StockCell({ product, onCommit }: { product: Product; onCommit: (stock: number) => void }) {
  const [value, setValue] = useState(String(product.stock));
  useEffect(() => setValue(String(product.stock)), [product.stock]);

  const commit = () => {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n < 0 || value.trim() === '') {
      setValue(String(product.stock)); // reject nonsense and show the real figure again
      return;
    }
    onCommit(n);
  };

  const tone = product.stock === 0 ? 'stock-out' : product.stock <= LOW_STOCK ? 'stock-low' : '';
  return (
    <input
      className={`stock-input ${tone}`}
      type="number"
      min={0}
      step={1}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setValue(String(product.stock));
      }}
      aria-label={`Stock for ${product.title}`}
    />
  );
}
