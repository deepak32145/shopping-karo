import type { Product } from '../data/products';
import { discountPct, formatINR, isLowestIn90Days } from '../lib';
import Sparkline from './Sparkline';

interface Props {
  product: Product;
  /** Absent for the admin account, which does not shop: the button is then left out. */
  onAdd?: (id: string) => void;
}

export default function ProductCard({ product: p, onAdd }: Props) {
  const lowest = isLowestIn90Days(p);
  const soldOut = p.stock <= 0;
  return (
    <article className={`card ${soldOut ? 'card-soldout' : ''}`}>
      <div className="card-art" style={{ ['--hue' as string]: p.hue }} aria-hidden="true">
        <span className="card-emoji">{p.emoji}</span>
        {discountPct(p) > 0 && <span className="chip chip-off">-{discountPct(p)}%</span>}
        {lowest && !soldOut && <span className="chip chip-low">Lowest in 90 days</span>}
        {!soldOut && p.stock <= 5 && <span className="chip chip-stock">Only {p.stock} left</span>}
      </div>
      <div className="card-body">
        <h3 className="card-title">{p.title}</h3>
        <p className="card-seller">by {p.seller}</p>
        {p.reviews > 0 && (
          <p className="card-rating">
            <span aria-hidden="true">★</span> {p.rating.toFixed(1)} <span className="muted">({p.reviews.toLocaleString('en-IN')})</span>
          </p>
        )}
        <div className="card-price-row">
          <div>
            <span className="price">{formatINR(p.price)}</span>
            {p.mrp > p.price && <span className="mrp">{formatINR(p.mrp)}</span>}
          </div>
          <Sparkline data={p.history} />
        </div>
        {onAdd ? (
          <button className="btn btn-primary btn-block" onClick={() => onAdd(p.id)} disabled={soldOut}>
            {soldOut ? 'Out of stock' : 'Add to cart'}
          </button>
        ) : (
          soldOut && <p className="muted">Out of stock</p>
        )}
      </div>
    </article>
  );
}
