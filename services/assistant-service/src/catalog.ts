export const CATEGORIES = ['electronics', 'furniture', 'beauty', 'books', 'fashion'] as const;
export const MOMENTS = ['festive', 'hostel', 'gifting', 'monsoon', 'wfh', 'kitchen'] as const;

/** The fields of a catalog-service product that the assistant uses. Money is integer paise. */
export interface CatalogProduct {
  id: string;
  title: string;
  seller: string;
  price: number;
  mrp: number;
  stock: number;
  rating: number;
  reviews: number;
  category: string;
  moments: string[];
  keywords: string;
  deal?: { endsAt: string; claimedPct: number };
}

export interface CatalogSource {
  all(): Promise<CatalogProduct[]>;
}

/** Reads the public product list from catalog-service and keeps it for a minute, so a chat burst is one request. */
export class CatalogClient implements CatalogSource {
  private cache: { at: number; items: CatalogProduct[] } | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly ttlMs = 60_000,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async all(): Promise<CatalogProduct[]> {
    if (this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.items;
    try {
      const res = await this.fetchFn(`${this.baseUrl}/products?limit=200`, { signal: AbortSignal.timeout(4_000) });
      if (!res.ok) throw new Error(`catalog answered ${res.status}`);
      const body = (await res.json()) as { items?: CatalogProduct[] };
      this.cache = { at: this.now(), items: body.items ?? [] };
    } catch (err) {
      if (!this.cache) throw err; // nothing to fall back on
      console.warn('catalog unreachable, using the last copy:', (err as Error).message);
      this.cache.at = this.now() - this.ttlMs + 10_000; // retry in 10 seconds
    }
    return this.cache.items;
  }
}

export interface SearchInput {
  query?: string;
  category?: string;
  moment?: string;
  maxPriceInr?: number;
  limit: number;
}

const STOP_WORDS = new Set(['for', 'a', 'an', 'the', 'to', 'and', 'or', 'of', 'in', 'on', 'with', 'my', 'me', 'some', 'good', 'best', 'cheap', 'under', 'below', 'rs', 'inr']);

/** Words from the query that can actually match something. */
const words = (q: string | undefined): string[] =>
  (q ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

/** Filters by category, moment and budget, then ranks by how many query words appear (title counts double). In-stock items come first. */
export function searchProducts(products: CatalogProduct[], input: SearchInput): CatalogProduct[] {
  const terms = words(input.query);
  const scored: { p: CatalogProduct; score: number }[] = [];
  for (const p of products) {
    if (input.category && p.category !== input.category) continue;
    if (input.moment && !p.moments.includes(input.moment)) continue;
    if (input.maxPriceInr !== undefined && p.price > input.maxPriceInr * 100) continue;
    const title = p.title.toLowerCase();
    const rest = `${p.seller} ${p.keywords} ${p.category} ${p.moments.join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of terms) score += (title.includes(t) ? 2 : 0) + (rest.includes(t) ? 1 : 0);
    if (terms.length > 0 && score === 0) continue;
    scored.push({ p, score });
  }
  scored.sort((a, b) => Number(b.p.stock > 0) - Number(a.p.stock > 0) || b.score - a.score || b.p.rating - a.p.rating);
  return scored.slice(0, input.limit).map((s) => s.p);
}

const rupees = (paise: number) => Math.round(paise / 100);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** What the model sees. Catalogue text is clipped because it is written by people and must be treated as data. */
export function toToolView(p: CatalogProduct) {
  return {
    id: p.id,
    name: clip(p.title, 120),
    brand: clip(p.seller, 60),
    category: p.category,
    price_inr: rupees(p.price),
    mrp_inr: rupees(p.mrp),
    discount_percent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
    in_stock: p.stock > 0,
    stock_note: p.stock > 0 && p.stock <= 5 ? `only ${p.stock} left` : undefined,
    rating: p.rating,
    rating_count: p.reviews,
    occasions: p.moments,
    deal_ends_at: p.deal?.endsAt,
  };
}
