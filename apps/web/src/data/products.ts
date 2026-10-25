import type { CategoryId } from './categories';

export type MomentId ='festive' | 'hostel' | 'gifting' | 'monsoon' | 'wfh' | 'kitchen';
export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

/** A product as returned by catalog-service. Prices are integer paise, same convention as the backend. */
export interface Product {
  id: string;
  title: string;
  seller: string;
  price: number;
  mrp: number;
  stock: number;
  rating: number;
  reviews: number;
  emoji: string;
  hue: number;
  category: CategoryId;
  moments: MomentId[];
  keywords: string;
  status: ProductStatus;
  /** Last 12 price points, oldest first; the last entry is the current price. */
  history: number[];
  /** Present only while a limited-time deal is running. */
  deal?: { endsAt: string; claimedPct: number };
}

export interface Moment {
  id: MomentId;
  label: string;
  blurb: string;
  emoji: string;
  hue: number;
}

export const moments: Moment[] = [
  { id: 'festive', label: 'Festive prep', blurb: 'Diyas, lights, mithai boxes', emoji: '🪔', hue: 28 },
  { id: 'gifting', label: 'Gift in 2 minutes', blurb: 'Thoughtful, wrapped, under budget', emoji: '🎁', hue: 330 },
  { id: 'wfh', label: 'Desk glow-up', blurb: 'Work from anywhere, comfortably', emoji: '🖥️', hue: 215 },
  { id: 'monsoon', label: 'Monsoon ready', blurb: 'Stay dry, stay cosy', emoji: '☔', hue: 190 },
  { id: 'hostel', label: 'Hostel & PG', blurb: 'Small space, big upgrades', emoji: '🛏️', hue: 265 },
  { id: 'kitchen', label: 'Kitchen fixes', blurb: 'Everyday tools that just work', emoji: '🍳', hue: 150 },
];
