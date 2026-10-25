import { useCallback, useEffect, useRef, useState } from 'react';
import { cartApi, type ServerCartLine } from './api';
import type { User } from './auth';

export interface CartLine {
  id: string; // product id
  qty: number;
}

const GUEST_KEY = 'sk-guest-cart';
const MAX_QTY = 99;

const fromServer = (lines: ServerCartLine[]): CartLine[] => lines.map((l) => ({ id: l.productId, qty: l.qty }));

function readGuest(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((l) => typeof l?.id === 'string' && Number.isInteger(l?.qty) && l.qty > 0) : [];
  } catch {
    return [];
  }
}

function writeGuest(lines: CartLine[]) {
  try {
    if (lines.length) localStorage.setItem(GUEST_KEY, JSON.stringify(lines));
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* storage unavailable: the guest cart just won't survive a reload */
  }
}

/**
 * The shopping cart. Signed out: kept in this browser. Signed in: kept on the server (cart-service), so it follows
 * the user to any device. On sign-in, whatever was in the guest cart is merged into the saved one.
 */
export function useCart(user: User | null, authReady: boolean) {
  const [lines, setLines] = useState<CartLine[]>(readGuest);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;
  // Server replies can arrive out of order when the user clicks quickly; only the newest reply may overwrite local state.
  const latest = useRef(0);

  // Load the saved cart when someone signs in; fall back to the guest cart when nobody is.
  useEffect(() => {
    if (!authReady) return;
    const ticket = ++latest.current;
    if (!userId) {
      setLines(readGuest());
      return;
    }
    const guest = readGuest();
    (guest.length ? cartApi.merge(guest.map((l) => ({ productId: l.id, qty: l.qty }))) : cartApi.get())
      .then((cart) => {
        writeGuest([]); // now safely on the server
        if (ticket === latest.current) {
          setLines(fromServer(cart.lines));
          setError(null);
        }
      })
      .catch(() => {
        if (ticket === latest.current) setError("We couldn't load your saved cart. Please refresh.");
      });
  }, [userId, authReady]);

  const sync = useCallback(
    (next: CartLine[], remote: () => Promise<{ lines: ServerCartLine[] }>) => {
      const ticket = ++latest.current;
      setLines(next); // optimistic: the UI never waits for the network
      setError(null);
      if (!userId) {
        writeGuest(next);
        return;
      }
      remote()
        .then((cart) => ticket === latest.current && setLines(fromServer(cart.lines)))
        .catch(() => {
          if (ticket !== latest.current) return;
          setError("We couldn't save that change. Reverting to your saved cart.");
          cartApi.get().then((cart) => ticket === latest.current && setLines(fromServer(cart.lines))).catch(() => undefined);
        });
    },
    [userId],
  );

  const add = useCallback(
    (id: string) => {
      const existing = lines.find((l) => l.id === id);
      const next = existing ? lines.map((l) => (l.id === id ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l)) : [...lines, { id, qty: 1 }];
      sync(next, () => cartApi.add(id, 1));
    },
    [lines, sync],
  );

  /** Adds `delta` (negative to reduce). Reaching 0 removes the line. */
  const change = useCallback(
    (id: string, delta: number) => {
      const current = lines.find((l) => l.id === id)?.qty ?? 0;
      const qty = Math.max(0, Math.min(MAX_QTY, current + delta));
      const next = qty === 0 ? lines.filter((l) => l.id !== id) : lines.map((l) => (l.id === id ? { ...l, qty } : l));
      sync(next, () => cartApi.setQty(id, qty));
    },
    [lines, sync],
  );

  /** After an order is placed the server has already emptied the cart; just mirror that here. */
  const clearLocal = useCallback(() => {
    latest.current++;
    setLines([]);
    writeGuest([]);
  }, []);

  return { lines, error, add, change, clearLocal };
}
