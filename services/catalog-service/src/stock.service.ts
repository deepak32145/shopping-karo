import { HttpError } from '@sk/node-common';
import { Product } from './product.model';
import { StockReservation, type ReservedItem } from './stock.model';

/** Several lines for one product are folded into one, and the order is fixed so concurrent orders lock alike. */
function normalise(items: ReservedItem[]): ReservedItem[] {
  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.productId, (totals.get(i.productId) ?? 0) + i.qty);
  return [...totals].map(([productId, qty]) => ({ productId, qty })).sort((a, b) => a.productId.localeCompare(b.productId));
}

async function giveBack(items: ReservedItem[]) {
  for (const i of items) await Product.updateOne({ _id: i.productId }, { $inc: { stock: i.qty } });
}

/**
 * Takes stock for an order, all or nothing. Each decrement is a single conditional update ("only if enough is left"),
 * so two shoppers can never both get the last unit. If any product runs short, the ones already taken are put back.
 * Safe to call again for the same order.
 */
export async function reserveStock(orderId: string, requested: ReservedItem[]): Promise<void> {
  const existing = await StockReservation.findById(orderId);
  if (existing?.status === 'RESERVED') return; // retry of a call that already succeeded
  if (existing) throw new HttpError(409, 'RESERVATION_RELEASED', 'Stock for this order was already released');

  const items = normalise(requested);
  const taken: ReservedItem[] = [];
  for (const item of items) {
    const res = await Product.updateOne({ _id: item.productId, status: 'ACTIVE', stock: { $gte: item.qty } }, { $inc: { stock: -item.qty } });
    if (res.modifiedCount === 1) {
      taken.push(item);
      continue;
    }
    await giveBack(taken);
    const product = await Product.findById(item.productId).select('stock status title');
    const available = product && product.status === 'ACTIVE' ? product.stock : 0;
    throw new HttpError(409, 'OUT_OF_STOCK', product ? `Only ${available} of “${product.title}” left` : 'A product in this order no longer exists', [
      `${item.productId}: ${available}`,
    ]);
  }

  try {
    await StockReservation.create({ _id: orderId, items, status: 'RESERVED' });
  } catch (err) {
    await giveBack(taken); // a concurrent call for the same order won the race; its reservation stands
    if ((err as { code?: number }).code === 11000) return;
    throw err;
  }
}

/** Puts an order's stock back. Idempotent: the atomic status flip means only the first call returns anything. */
export async function releaseStock(orderId: string): Promise<boolean> {
  const reservation = await StockReservation.findOneAndUpdate({ _id: orderId, status: 'RESERVED' }, { status: 'RELEASED' });
  if (!reservation) return false;
  await giveBack(reservation.items.map((i) => ({ productId: i.productId as string, qty: i.qty as number })));
  return true;
}
