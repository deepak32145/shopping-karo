import { authFetch } from './auth';
import type { CategoryId } from './data/categories';
import type { MomentId, Product, ProductStatus } from './data/products';
import type { Address, AddressInput, Order, OrderStats, OrderStatus, Page, PaymentMethod } from './data/orders';
import { parseJson } from './http';

/** What the admin form sends. Money in paise. */
export interface ProductInput {
  title: string;
  seller: string;
  price: number;
  mrp: number;
  stock: number;
  emoji: string;
  hue: number;
  category: CategoryId;
  moments: MomentId[];
  keywords: string;
  status: ProductStatus;
  deal: { endsInHours: number; claimedPct: number } | null;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const catalogApi = {
  /** Public: active products only. */
  list: () => fetch('/api/catalog/products').then((r) => parseJson<{ items: Product[] }>(r)).then((d) => d.items),

  adminList: () => authFetch('/api/catalog/admin/products').then((r) => parseJson<{ items: Product[] }>(r)).then((d) => d.items),
  create: (input: ProductInput) => authFetch('/api/catalog/admin/products', { method: 'POST', ...json(input) }).then((r) => parseJson<Product>(r)),
  update: (id: string, input: ProductInput) =>
    authFetch(`/api/catalog/admin/products/${encodeURIComponent(id)}`, { method: 'PUT', ...json(input) }).then((r) => parseJson<Product>(r)),
  setStock: (id: string, stock: number) =>
    authFetch('/api/catalog/admin/products/' + encodeURIComponent(id) + '/stock', { method: 'PATCH', ...json({ stock }) }).then((r) => parseJson<Product>(r)),
  archive: (id: string) => authFetch(`/api/catalog/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => parseJson<Product>(r)),
};

export interface ServerCartLine {
  productId: string;
  qty: number;
}
interface ServerCart {
  lines: ServerCartLine[];
}

export const cartApi = {
  get: () => authFetch('/api/cart/cart').then((r) => parseJson<ServerCart>(r)),
  add: (productId: string, qty = 1) => authFetch('/api/cart/cart/items', { method: 'POST', ...json({ productId, qty }) }).then((r) => parseJson<ServerCart>(r)),
  setQty: (productId: string, qty: number) =>
    authFetch(`/api/cart/cart/items/${encodeURIComponent(productId)}`, { method: 'PUT', ...json({ qty }) }).then((r) => parseJson<ServerCart>(r)),
  merge: (lines: ServerCartLine[]) => authFetch('/api/cart/cart/merge', { method: 'POST', ...json({ lines }) }).then((r) => parseJson<ServerCart>(r)),
};

export const addressApi = {
  list: () => authFetch('/api/addresses').then((r) => parseJson<Address[]>(r)),
  create: (a: AddressInput) => authFetch('/api/addresses', { method: 'POST', ...json(a) }).then((r) => parseJson<Address>(r)),
  update: (id: string, a: AddressInput) => authFetch('/api/addresses/' + id, { method: 'PUT', ...json(a) }).then((r) => parseJson<Address>(r)),
  setDefault: (id: string) => authFetch('/api/addresses/' + id + '/default', { method: 'POST' }).then((r) => parseJson<Address>(r)),
  remove: (id: string) => authFetch('/api/addresses/' + id, { method: 'DELETE' }).then((r) => parseJson<void>(r)),
};

export interface PayInput {
  method: PaymentMethod;
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
  cardholder?: string;
  upiId?: string;
}

export const orderApi = {
  checkout: (addressId: string) => authFetch('/api/orders', { method: 'POST', ...json({ addressId }) }).then((r) => parseJson<Order>(r)),
  list: () => authFetch('/api/orders').then((r) => parseJson<Order[]>(r)),
  get: (id: string) => authFetch('/api/orders/' + id).then((r) => parseJson<Order>(r)),
  pay: (id: string, body: PayInput) => authFetch('/api/orders/' + id + '/pay', { method: 'POST', ...json(body) }).then((r) => parseJson<Order>(r)),
  cancel: (id: string) => authFetch('/api/orders/' + id + '/cancel', { method: 'POST' }).then((r) => parseJson<Order>(r)),
};

export const adminOrderApi = {
  list: (p: { status?: OrderStatus | null; q?: string; page?: number; size?: number }) => {
    const qs = new URLSearchParams();
    if (p.status) qs.set('status', p.status);
    if (p.q) qs.set('q', p.q);
    qs.set('page', String(p.page ?? 0));
    qs.set('size', String(p.size ?? 25));
    return authFetch('/api/admin/orders?' + qs).then((r) => parseJson<Page<Order>>(r));
  },
  stats: () => authFetch('/api/admin/orders/stats').then((r) => parseJson<OrderStats>(r)),
  setStatus: (id: string, status: OrderStatus, note?: string) =>
    authFetch('/api/admin/orders/' + id + '/status', { method: 'POST', ...json({ status, note }) }).then((r) => parseJson<Order>(r)),
};
