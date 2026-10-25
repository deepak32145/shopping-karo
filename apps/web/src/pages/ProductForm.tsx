import { FormEvent, useState } from 'react';
import { catalogApi, type ProductInput } from '../api';
import ProductCard from '../components/ProductCard';
import { ApiError } from '../http';
import { categories, type CategoryId } from '../data/categories';
import { MomentId, moments, type Product, type ProductStatus } from '../data/products';

interface Props {
  /** Product being edited, or null to create a new one. */
  product: Product | null;
  onSaved: (saved: Product) => void;
  onCancel: () => void;
}

const rupees = (paise: number) => String(paise / 100);
const toPaise = (value: string) => Math.round(Number(value) * 100);

export default function ProductForm({ product, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(product?.title ?? '');
  const [seller, setSeller] = useState(product?.seller ?? '');
  const [price, setPrice] = useState(product ? rupees(product.price) : '');
  const [mrp, setMrp] = useState(product ? rupees(product.mrp) : '');
  const [stock, setStock] = useState(String(product?.stock ?? 10));
  const [emoji, setEmoji] = useState(product?.emoji ?? '🛍️');
  const [hue, setHue] = useState(product?.hue ?? 20);
  const [category, setCategory] = useState<CategoryId>(product?.category ?? 'electronics');
  const [selected, setSelected] = useState<MomentId[]>(product?.moments ?? []);
  const [keywords, setKeywords] = useState(product?.keywords ?? '');
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'ACTIVE');
  const [hasDeal, setHasDeal] = useState(Boolean(product?.deal));
  const [dealHours, setDealHours] = useState(() =>
    product?.deal ? String(Math.max(1, Math.round((new Date(product.deal.endsAt).getTime() - Date.now()) / 3_600_000))) : '24',
  );
  const [claimed, setClaimed] = useState(String(product?.deal?.claimedPct ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleMoment = (id: MomentId) => setSelected((s) => (s.includes(id) ? s.filter((m) => m !== id) : [...s, id]));

  const input = (): ProductInput => ({
    title: title.trim(),
    seller: seller.trim(),
    price: toPaise(price),
    mrp: toPaise(mrp),
    stock: Math.trunc(Number(stock)),
    emoji: emoji.trim() || '🛍️',
    hue,
    category,
    moments: selected,
    keywords: keywords.trim(),
    status,
    deal: hasDeal ? { endsInHours: Number(dealHours), claimedPct: Math.trunc(Number(claimed)) } : null,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = input();
    if (body.mrp < body.price) {
      setError('MRP must be at least the selling price.');
      return;
    }
    setBusy(true);
    try {
      onSaved(product ? await catalogApi.update(product.id, body) : await catalogApi.create(body));
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors.length ? err.fieldErrors.join(' · ') : err.message) : 'Could not reach the product service.');
    } finally {
      setBusy(false);
    }
  };

  // What the shopper will see, built from the form as it is typed.
  const preview: Product = {
    id: 'preview',
    title: title || 'Product title',
    seller: seller || 'Seller',
    price: toPaise(price) || 0,
    mrp: toPaise(mrp) || 0,
    stock: Math.trunc(Number(stock)) || 0,
    rating: product?.rating ?? 0,
    reviews: product?.reviews ?? 0,
    emoji,
    hue,
    category,
    moments: selected,
    keywords,
    status,
    history: product?.history ?? Array(12).fill(toPaise(price) || 0),
  };

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="pf-title">
      <div className="scrim scrim-on" onClick={onCancel} />
      <form className="modal modal-wide" onSubmit={submit}>
        <button type="button" className="icon-btn modal-x" onClick={onCancel} aria-label="Close">✕</button>
        <h2 id="pf-title">{product ? 'Edit product' : 'Add a product'}</h2>

        <div className="pf-grid">
          <div className="pf-fields">
            <label className="field">Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={140} />
            </label>
            <label className="field">Seller
              <input value={seller} onChange={(e) => setSeller(e.target.value)} required minLength={2} maxLength={80} />
            </label>
            <div className="pf-row">
              <label className="field">Price (₹)
                <input type="number" min="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </label>
              <label className="field">MRP (₹)
                <input type="number" min="1" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} required />
              </label>
              <label className="field">Stock
                <input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} required />
              </label>
            </div>
            <div className="pf-row">
              <label className="field">Emoji
                <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={16} />
              </label>
              <label className="field pf-grow">Card colour
                <input type="range" min="0" max="360" value={hue} onChange={(e) => setHue(Number(e.target.value))} className="hue-range" />
              </label>
            </div>
            <label className="field">Category
              <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)} required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </label>
            <fieldset className="pf-moments">
              <legend>Shows up in</legend>
              {moments.map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleMoment(m.id)} /> {m.emoji} {m.label}
                </label>
              ))}
            </fieldset>
            <label className="field">Search keywords
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} maxLength={200} placeholder="diwali lamp decor gift for mom" />
            </label>
            <label className="field">Status
              <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)}>
                <option value="ACTIVE">Active: visible in the store</option>
                <option value="DRAFT">Draft: hidden</option>
                <option value="ARCHIVED">Archived: hidden</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={hasDeal} onChange={(e) => setHasDeal(e.target.checked)} /> Run as a limited-time deal
            </label>
            {hasDeal && (
              <div className="pf-row">
                <label className="field">Ends in (hours)
                  <input type="number" min="0.1" max="720" step="any" value={dealHours} onChange={(e) => setDealHours(e.target.value)} required />
                </label>
                <label className="field">Claimed % (shown on the bar)
                  <input type="number" min="0" max="100" step="1" value={claimed} onChange={(e) => setClaimed(e.target.value)} required />
                </label>
              </div>
            )}
          </div>

          <div className="pf-preview" aria-label="Preview">
            <p className="muted">Preview</p>
            <ProductCard product={preview} onAdd={() => undefined} />
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="pf-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : product ? 'Save changes' : 'Add product'}</button>
        </div>
      </form>
    </div>
  );
}
