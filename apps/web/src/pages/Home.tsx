import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Categories from '../components/Categories';
import DealRadar from '../components/DealRadar';
import Hero from '../components/Hero';
import Moments from '../components/Moments';
import ProductCard from '../components/ProductCard';
import TrustStrip from '../components/TrustStrip';
import { categories, isCategoryId, type CategoryId } from '../data/categories';
import { MomentId, moments, type Product } from '../data/products';
import { MAX_BUDGET, discountPct, formatINR, matchesWords, parseQuery } from '../lib';

interface Props {
  products: Product[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  query: string;
  onQuery: (q: string) => void;
  /** Absent for the admin account, which browses the store but does not shop. */
  onAdd?: (id: string) => void;
}

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'discount';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
  { id: 'discount', label: 'Biggest discount' },
];

const SORTERS: Record<Exclude<Sort, 'featured'>, (a: Product, b: Product) => number> = {
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  discount: (a, b) => discountPct(b) - discountPct(a),
};

const PAGE_SIZE = 24;

/** Featured order: one product from each category in turn, so the first page is a mix instead of one department. */
function interleaveByCategory(list: Product[]): Product[] {
  const lanes = categories.map((c) => list.filter((p) => p.category === c.id)).filter((l) => l.length > 0);
  const out: Product[] = [];
  for (let i = 0; out.length < list.length; i++) for (const lane of lanes) if (i < lane.length) out.push(lane[i]);
  return out;
}

export default function Home({ products, loading, error, onRetry, query, onQuery, onAdd }: Props) {
  const [params, setParams] = useSearchParams();
  const [budget, setBudget] = useState(MAX_BUDGET); // start by showing everything; the slider narrows it
  const [moment, setMoment] = useState<MomentId | null>(null);
  const [sort, setSort] = useState<Sort>('featured');
  const [visible, setVisible] = useState(PAGE_SIZE);

  // The category lives in the URL (/?category=books) so a filtered view can be shared or bookmarked.
  const rawCategory = params.get('category');
  const category: CategoryId | null = isCategoryId(rawCategory) ? rawCategory : null;
  const setCategory = (id: CategoryId | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('category', id);
        else next.delete('category');
        return next;
      },
      { replace: true },
    );

  const parsed = useMemo(() => parseQuery(query), [query]);
  // A budget typed into search ("under 500") overrides the slider.
  const effectiveBudget = parsed.budget ?? budget;

  const picks = useMemo(() => {
    const matches = products.filter(
      (p) =>
        (effectiveBudget >= MAX_BUDGET || p.price <= effectiveBudget * 100) &&
        (category === null || p.category === category) &&
        (moment === null || p.moments.includes(moment)) &&
        matchesWords(p, parsed.words),
    );
    return sort === 'featured' ? interleaveByCategory(matches) : [...matches].sort(SORTERS[sort]);
  }, [products, effectiveBudget, category, moment, parsed.words, sort]);

  // Back to the first page whenever the result set changes.
  useEffect(() => setVisible(PAGE_SIZE), [effectiveBudget, category, moment, parsed.words, sort]);

  // Infinite scroll: when the marker under the grid comes within ~600px of the viewport, reveal the next page.
  // The observer is recreated after each page, so a marker that is still on screen (tall window) keeps loading.
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = visible < picks.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!hasMore || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, visible]);

  const deals = useMemo(() => products.filter((p) => p.deal), [products]);
  const scrollToPicks = () => document.getElementById('picks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const activeMoment = moments.find((m) => m.id === moment);
  const activeCategory = categories.find((c) => c.id === category);
  const filtered = category !== null || moment !== null || query !== '';
  const heading = activeCategory ? `${activeCategory.emoji} ${activeCategory.label}` : activeMoment ? `${activeMoment.emoji} ${activeMoment.label}` : 'Picks for you';

  const clearAll = () => {
    setCategory(null);
    setMoment(null);
    onQuery('');
  };

  return (
    <main>
      <Hero budget={effectiveBudget} onBudget={(b) => { onQuery(''); setBudget(b); }} matchCount={picks.length} onSeePicks={scrollToPicks} />
      <Categories products={products} active={category} onPick={(id) => { setCategory(id); scrollToPicks(); }} />
      <Moments active={moment} onPick={setMoment} />
      <DealRadar deals={deals} onAdd={onAdd} />

      <section className="section" id="picks">
        <div className="section-head picks-head">
          <div>
            <h2>
              {heading}
              {activeCategory && activeMoment ? ` · ${activeMoment.label}` : ''}
              {!loading && !error && <span className="count"> · {picks.length}</span>}
            </h2>
            <p className="muted">
              {effectiveBudget >= MAX_BUDGET ? 'Any budget' : `Up to ${formatINR(effectiveBudget * 100)}`}
              {parsed.words.length > 0 && <> · matching “{parsed.words.join(' ')}”</>}
              {filtered && <button className="link" onClick={clearAll}>Clear filters</button>}
            </p>
          </div>
          {!loading && !error && picks.length > 1 && (
            <label className="sort">
              <span className="muted">Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {loading ? (
          <div className="grid" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="card skeleton" />
            ))}
          </div>
        ) : error ? (
          <div className="empty">
            <p>{error}</p>
            <button className="btn btn-dark" onClick={onRetry}>Try again</button>
          </div>
        ) : products.length === 0 ? (
          <div className="empty"><p>The store is empty right now. Check back soon.</p></div>
        ) : picks.length === 0 ? (
          <div className="empty">
            <p>Nothing fits that yet. Try a higher budget or fewer words.</p>
            <button className="btn btn-dark" onClick={() => { clearAll(); setBudget(MAX_BUDGET); }}>
              Show everything
            </button>
          </div>
        ) : (
          <>
            <div className="grid">
              {picks.slice(0, visible).map((p) => (
                <ProductCard key={p.id} product={p} onAdd={onAdd} />
              ))}
            </div>
            {visible < picks.length && (
              // Scrolling near this marker loads the next page (see the observer effect above).
              <div className="more" ref={sentinel} aria-live="polite">
                <p className="muted">Showing {visible} of {picks.length}, loading more as you scroll…</p>
              </div>
            )}
          </>
        )}
      </section>

      <TrustStrip />
    </main>
  );
}
