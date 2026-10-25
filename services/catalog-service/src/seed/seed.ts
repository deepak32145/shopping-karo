import { Product } from '../product.model';
import { SEED_PRODUCTS } from './data';

const WEEK_MS = 7 * 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

/**
 * Inserts the sample catalogue. Safe to run repeatedly: a product that already exists (same id) is left exactly as
 * it is, so admin edits are never overwritten. Returns how many were newly inserted.
 */
export async function seedProducts(): Promise<{ inserted: number; skipped: number }> {
  const now = Date.now();
  const result = await Product.bulkWrite(
    SEED_PRODUCTS.map((p) => {
      const { id, priceHistory, deal, ...fields } = p;
      return {
        updateOne: {
          filter: { _id: id },
          update: {
            $setOnInsert: <Record<string, unknown>>{
              ...fields,
              status: 'ACTIVE',
              priceHistory: priceHistory.map((price, i) => ({ price, at: new Date(now - (priceHistory.length - 1 - i) * WEEK_MS) })),
              ...(deal ? { deal: { endsAt: new Date(now + deal.days * DAY_MS), claimedPct: deal.claimedPct } } : {}),
              createdBy: 'seed',
            },
          },
          upsert: true,
        },
      };
    }),
  );
  return { inserted: result.upsertedCount, skipped: SEED_PRODUCTS.length - result.upsertedCount };
}
