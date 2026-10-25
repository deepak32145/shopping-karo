import { z } from 'zod';
import { CATEGORIES, MOMENTS, STATUSES } from './product.model';

/** What an admin submits to create or fully replace a product. Money is integer paise. */
export const productInput = z
  .object({
    title: z.string().trim().min(2).max(140),
    seller: z.string().trim().min(2).max(80),
    price: z.number().int().min(1),
    mrp: z.number().int().min(1),
    stock: z.number().int().min(0).max(1_000_000),
    emoji: z.string().trim().min(1).max(16).default('🛍️'),
    hue: z.number().int().min(0).max(360).default(20),
    category: z.enum(CATEGORIES),
    moments: z.array(z.enum(MOMENTS)).max(MOMENTS.length).default([]),
    keywords: z.string().trim().max(200).default(''),
    status: z.enum(STATUSES).default('ACTIVE'),
    /** Limited-time deal: ends this many hours from now. Null/absent = no deal. */
    deal: z
      .object({ endsInHours: z.number().min(0.1).max(24 * 30), claimedPct: z.number().int().min(0).max(100).default(0) })
      .nullish(),
  })
  .refine((p) => p.mrp >= p.price, { path: ['mrp'], message: 'must be at least the selling price' });

export type ProductInput = z.infer<typeof productInput>;

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  moment: z.enum(MOMENTS).optional(),
  category: z.enum(CATEGORIES).optional(),
  /** Comma-separated product ids, for looking up a known set (cart, order lines). */
  ids: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined))
    .pipe(z.array(z.string().max(64)).max(100).optional()),
  /** Paise. */
  maxPrice: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

export const adminListQuery = listQuery.extend({ status: z.enum(STATUSES).optional() });

/** Quick stock edit from the admin inventory table. */
export const stockInput = z.object({ stock: z.number().int().min(0).max(1_000_000) });
