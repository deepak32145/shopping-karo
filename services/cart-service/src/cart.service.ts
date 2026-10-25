import { HttpError } from '@sk/node-common';
import { Cart, MAX_LINES, MAX_QTY_PER_LINE, type CartLine } from './cart.model';

const MAX_ATTEMPTS = 15;

const isRetryable = (err: unknown) =>
  typeof err === 'object' && err !== null && ((err as { name?: string }).name === 'VersionError' || (err as { code?: number }).code === 11000);

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Loads the user's cart, applies `change` to its lines, saves. When a concurrent edit got there first the save is
 * refused (optimistic locking) and we start again from the fresh cart, after a short random pause so that several
 * waiting requests stop colliding with each other. If it is still contended after many tries, the caller gets a
 * clear "try again" (409) instead of a crash.
 */
async function mutate(userId: string, change: (lines: CartLine[]) => CartLine[]) {
  for (let attempt = 1; ; attempt++) {
    try {
      const cart = (await Cart.findById(userId)) ?? new Cart({ _id: userId, lines: [] });
      const next = change(cart.lines.map((l) => ({ productId: l.productId, qty: l.qty })));
      if (next.length > MAX_LINES) {
        throw new HttpError(400, 'CART_FULL', `A cart can hold at most ${MAX_LINES} different products`);
      }
      cart.set('lines', next);
      await cart.save();
      return cart;
    } catch (err) {
      if (!isRetryable(err)) throw err;
      if (attempt >= MAX_ATTEMPTS) throw new HttpError(409, 'CART_BUSY', 'Your cart is being updated from several places at once. Please try again.');
      await pause(Math.random() * attempt * 8);
    }
  }
}

const cap = (qty: number) => Math.min(MAX_QTY_PER_LINE, qty);

export const cartService = {
  async get(userId: string) {
    return (await Cart.findById(userId)) ?? new Cart({ _id: userId, lines: [] });
  },

  /** Adds `qty` of a product, adding to what is already there. */
  add(userId: string, productId: string, qty: number) {
    return mutate(userId, (lines) => {
      const line = lines.find((l) => l.productId === productId);
      if (line) line.qty = cap(line.qty + qty);
      else lines.push({ productId, qty: cap(qty) });
      return lines;
    });
  },

  /** Sets the exact quantity; 0 removes the line. */
  setQty(userId: string, productId: string, qty: number) {
    return mutate(userId, (lines) => {
      const rest = lines.filter((l) => l.productId !== productId);
      if (qty === 0) return rest;
      const existing = lines.find((l) => l.productId === productId);
      return existing ? lines.map((l) => (l.productId === productId ? { productId, qty } : l)) : [...rest, { productId, qty }];
    });
  },

  remove(userId: string, productId: string) {
    return mutate(userId, (lines) => lines.filter((l) => l.productId !== productId));
  },

  clear(userId: string) {
    return mutate(userId, () => []);
  },

  /** Folds a guest (signed-out) cart into the saved one: quantities are summed per product. */
  merge(userId: string, incoming: CartLine[]) {
    return mutate(userId, (lines) => {
      for (const inc of incoming) {
        const line = lines.find((l) => l.productId === inc.productId);
        if (line) line.qty = cap(line.qty + inc.qty);
        else lines.push({ productId: inc.productId, qty: cap(inc.qty) });
      }
      return lines;
    });
  },
};
