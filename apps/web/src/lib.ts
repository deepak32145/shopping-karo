import { Product, moments } from './data/products';

export const MAX_BUDGET = 10000;

export const formatINR = (paise: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export const discountPct = (p: Product): number => Math.round(((p.mrp - p.price) / p.mrp) * 100);

export const isLowestIn90Days = (p: Product): boolean => p.price <= Math.min(...p.history);

const STOP_WORDS = new Set(['for', 'a', 'the', 'to', 'and', 'under', 'below', 'best', 'my', 'me', 'of', 'in', 'rs', 'inr']);

export interface ParsedQuery {
  /** Budget in rupees found in text like "under 500"; null if none. */
  budget: number | null;
  words: string[];
}

/** Tiny natural-language parser: "gift for dad under 1000" -> budget 1000, words [gift, dad]. */
export function parseQuery(q: string): ParsedQuery {
  const text = q.toLowerCase().replace(/[₹,]/g, '');
  const m = text.match(/(?:under|below|within|upto|up to)\s*(\d+)/);
  const budget = m ? Number(m[1]) : null;
  const words = text
    .replace(/(?:under|below|within|upto|up to)\s*\d+/, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  return { budget, words };
}

export function matchesWords(p: Product, words: string[]): boolean {
  const momentLabels = p.moments.map((id) => moments.find((m) => m.id === id)?.label ?? '').join(' ');
  const haystack = `${p.title} ${p.seller} ${p.keywords} ${momentLabels}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
export const formatDate = (iso: string): string => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

/** "just now", "5 min ago", "3 h ago", or a date for anything older than a day. */
export function timeAgo(iso: string, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return formatDate(iso);
}

export const addressLines = (a: { line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; pincode: string }): string =>
  [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(', ');

/** "1 item", "3 items". */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
