import type { Product } from '../data/products';
import { formatINR } from '../lib';
import type { CartLine } from '../useCart';

interface Props {
  open: boolean;
  lines: CartLine[];
  products: Product[];
  error: string | null;
  signedIn: boolean;
  onClose: () => void;
  onChangeQty: (id: string, delta: number) => void;
  onSignIn: () => void;
  onCheckout: () => void;
}

const FREE_DELIVERY_AT = 49900; // paise

export default function CartDrawer({ open, lines, products, error, signedIn, onClose, onChangeQty, onSignIn, onCheckout }: Props) {
  const rows = lines.map((l) => ({ line: l, product: products.find((p) => p.id === l.id) }));
  const available = rows.filter((r): r is { line: CartLine; product: Product } => r.product !== undefined && r.product.status === 'ACTIVE');
  const total = available.reduce((sum, r) => sum + r.product.price * r.line.qty, 0);
  const remaining = Math.max(0, FREE_DELIVERY_AT - total);

  return (
    <>
      <div className={`scrim ${open ? 'scrim-on' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'drawer-on' : ''}`} aria-hidden={!open} aria-label="Shopping cart">
        <div className="drawer-head">
          <h2>Your cart</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close cart">✕</button>
        </div>

        {error && <p className="form-error cart-error" role="alert">{error}</p>}

        {rows.length === 0 ? (
          <p className="empty">Nothing here yet. Set a budget and see what fits.</p>
        ) : (
          <>
            <div className="ship">
              {remaining === 0 ? (
                <b>🎉 Free delivery unlocked</b>
              ) : (
                <span>Add <b>{formatINR(remaining)}</b> more for free delivery</span>
              )}
              <div className="meter"><span style={{ width: `${Math.min(100, (total / FREE_DELIVERY_AT) * 100)}%` }} /></div>
            </div>
            <ul className="lines">
              {rows.map(({ line, product: p }) =>
                p && p.status === 'ACTIVE' ? (
                  <li key={line.id}>
                    <span className="line-emoji" aria-hidden="true">{p.emoji}</span>
                    <div className="line-info">
                      <b>{p.title}</b>
                      <span>{formatINR(p.price)}{p.stock > 0 && line.qty > p.stock ? ` · only ${p.stock} in stock` : ''}</span>
                    </div>
                    <div className="qty">
                      <button onClick={() => onChangeQty(line.id, -1)} aria-label="Decrease quantity">−</button>
                      <span>{line.qty}</span>
                      <button onClick={() => onChangeQty(line.id, 1)} aria-label="Increase quantity">+</button>
                    </div>
                  </li>
                ) : (
                  <li key={line.id} className="line-gone">
                    <span className="line-emoji" aria-hidden="true">🚫</span>
                    <div className="line-info">
                      <b>No longer available</b>
                      <span>This item was removed from the store.</span>
                    </div>
                    <button className="link" onClick={() => onChangeQty(line.id, -line.qty)}>Remove</button>
                  </li>
                ),
              )}
            </ul>
            <div className="drawer-foot">
              <div className="total"><span>Total</span><b>{formatINR(total)}</b></div>
              {!signedIn && (
                <p className="muted save-hint">
                  <button className="link" onClick={onSignIn}>Sign in</button> to save this cart and find it on any device.
                </p>
              )}
              <button className="btn btn-primary btn-block" onClick={onCheckout} disabled={available.length === 0}>
                {signedIn ? `Checkout · ${formatINR(total)}` : "Sign in to check out"}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
