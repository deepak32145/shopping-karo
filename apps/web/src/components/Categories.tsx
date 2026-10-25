import { categories, type CategoryId } from '../data/categories';
import type { Product } from '../data/products';

interface Props {
  products: Product[];
  active: CategoryId | null;
  onPick: (id: CategoryId | null) => void;
}

/** "Shop by category": one tile per department, with how many products it holds. */
export default function Categories({ products, active, onPick }: Props) {
  return (
    <section className="section" aria-labelledby="cat-title">
      <div className="section-head">
        <h2 id="cat-title">Shop by category</h2>
      </div>
      <div className="cats">
        {categories.map((c) => {
          const count = products.filter((p) => p.category === c.id).length;
          return (
            <button
              key={c.id}
              className={`cat ${active === c.id ? 'cat-on' : ''}`}
              style={{ ['--hue' as string]: c.hue }}
              onClick={() => onPick(active === c.id ? null : c.id)}
              aria-pressed={active === c.id}
            >
              <span className="cat-emoji" aria-hidden="true">{c.emoji}</span>
              <span className="cat-text">
                <b>{c.label}</b>
                <small>{count > 0 ? `${count} products` : c.blurb}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
