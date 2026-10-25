import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { createAuth, createTestIssuer, type TestIssuer } from '@sk/node-common';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { CATEGORIES, Product } from '../src/product.model';
import { productInput } from '../src/product.input';
import { SEED_PRODUCTS } from '../src/seed/data';
import { seedProducts } from '../src/seed/seed';
import { StockReservation } from '../src/stock.model';

let container: StartedMongoDBContainer;
let issuer: TestIssuer;
let app: ReturnType<typeof createApp>;
let internalApp: ReturnType<typeof createApp>;
const INTERNAL_KEY = 'test-internal-key-123456';
let adminToken: string;
let buyerToken: string;

const valid = {
  title: 'Brass Tea Kettle, 1.2 L',
  seller: 'Rasoi Works',
  price: 129900,
  mrp: 199900,
  stock: 12,
  emoji: '🫖',
  hue: 40,
  category: 'furniture',
  moments: ['kitchen', 'gifting'],
  keywords: 'chai kettle kitchen',
};

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:7').start();
  await mongoose.connect(`${container.getConnectionString()}/sk_catalog_test`, { directConnection: true });
  issuer = await createTestIssuer();
  const auth = createAuth({ keys: issuer.keys, issuer: issuer.issuer });
  app = createApp(auth); // no internal key configured
  internalApp = createApp(auth, { internalKey: INTERNAL_KEY });
  adminToken = await issuer.sign('admin-1', ['ADMIN', 'BUYER']);
  buyerToken = await issuer.sign('buyer-1', ['BUYER']);
});

afterAll(async () => {
  await mongoose.disconnect();
  await container?.stop();
});

beforeEach(async () => {
  await Product.deleteMany({});
  await StockReservation.deleteMany({});
});

const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

describe('public catalogue', () => {
  it('lists only ACTIVE products and filters by budget, moment and words', async () => {
    await asAdmin(request(app).post('/admin/products')).send({ ...valid, title: 'Kettle', price: 129900 }).expect(201);
    await asAdmin(request(app).post('/admin/products')).send({ ...valid, title: 'Mug', price: 29900, mrp: 39900, moments: ['wfh'], keywords: 'coffee' }).expect(201);
    await asAdmin(request(app).post('/admin/products')).send({ ...valid, title: 'Hidden draft', status: 'DRAFT' }).expect(201);

    const all = await request(app).get('/products').expect(200);
    expect(all.body.items.map((p: { title: string }) => p.title).sort()).toEqual(['Kettle', 'Mug']);

    const cheap = await request(app).get('/products?maxPrice=50000').expect(200);
    expect(cheap.body.items.map((p: { title: string }) => p.title)).toEqual(['Mug']);

    const wfh = await request(app).get('/products?moment=wfh').expect(200);
    expect(wfh.body.items).toHaveLength(1);

    const words = await request(app).get('/products?q=coffee%20mug').expect(200);
    expect(words.body.items).toHaveLength(1);
    const none = await request(app).get('/products?q=coffee%20kettle').expect(200); // every word must match
    expect(none.body.items).toHaveLength(0);
  });

  it('returns the product by id, but not drafts or archived ones', async () => {
    const created = await asAdmin(request(app).post('/admin/products')).send(valid).expect(201);
    await request(app).get(`/products/${created.body.id}`).expect(200);
    await asAdmin(request(app).delete(`/admin/products/${created.body.id}`)).expect(200);
    await request(app).get(`/products/${created.body.id}`).expect(404);
    await request(app).get('/products/does-not-exist').expect(404);
  });

  it('treats regex characters in the search text as plain text', async () => {
    await asAdmin(request(app).post('/admin/products')).send(valid).expect(201);
    const res = await request(app).get('/products').query({ q: '.*' }).expect(200);
    expect(res.body.items).toHaveLength(0);
  });
});

describe('admin access control', () => {
  it('rejects anonymous callers with 401 and non-admins with 403', async () => {
    await request(app).post('/admin/products').send(valid).expect(401);
    await request(app).get('/admin/products').expect(401);
    await request(app).post('/admin/products').set('Authorization', `Bearer ${buyerToken}`).send(valid).expect(403);
    await request(app).put('/admin/products/x').set('Authorization', `Bearer ${buyerToken}`).send(valid).expect(403);
    await request(app).delete('/admin/products/x').set('Authorization', `Bearer ${buyerToken}`).expect(403);
  });

  it('rejects tokens that are expired, from another issuer, or garbage', async () => {
    const expired = await issuer.sign('admin-1', ['ADMIN'], { expiresIn: '-1m' });
    const foreign = await issuer.sign('admin-1', ['ADMIN'], { issuer: 'someone-else' });
    for (const token of [expired, foreign, 'not-a-jwt']) {
      await request(app).get('/admin/products').set('Authorization', `Bearer ${token}`).expect(401);
    }
  });
});

describe('admin product management', () => {
  it('creates a product with a sensible response', async () => {
    const res = await asAdmin(request(app).post('/admin/products')).send(valid).expect(201);
    expect(res.body).toMatchObject({ title: valid.title, price: 129900, mrp: 199900, stock: 12, status: 'ACTIVE' });
    expect(res.body.id).toBeTruthy();
    expect(res.body._id).toBeUndefined();
    expect(res.body.history).toHaveLength(12);
    expect(new Set(res.body.history)).toEqual(new Set([129900])); // brand-new: flat history
  });

  it('validates input', async () => {
    const bad = await asAdmin(request(app).post('/admin/products')).send({ ...valid, price: 1999.5, mrp: 100, title: 'x', hue: 999 }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    expect(bad.body.errors.join(' ')).toMatch(/price/);
    expect(bad.body.errors.join(' ')).toMatch(/mrp/);
    await asAdmin(request(app).post('/admin/products')).send({ ...valid, moments: ['not-a-moment'] }).expect(400);
    await asAdmin(request(app).post('/admin/products')).set('Content-Type', 'application/json').send('{"oops"').expect(400);
  });

  it('records price changes in the history and keeps them after unrelated edits', async () => {
    const { body } = await asAdmin(request(app).post('/admin/products')).send(valid).expect(201);
    const cut = await asAdmin(request(app).put(`/admin/products/${body.id}`)).send({ ...valid, price: 99900 }).expect(200);
    expect(cut.body.price).toBe(99900);
    expect(cut.body.history.at(-1)).toBe(99900);
    expect(cut.body.history.at(-2)).toBe(129900);

    const edited = await asAdmin(request(app).put(`/admin/products/${body.id}`)).send({ ...valid, price: 99900, stock: 3 }).expect(200);
    expect(edited.body.stock).toBe(3);
    expect(edited.body.history.at(-1)).toBe(99900);
    expect(edited.body.history.filter((p: number) => p === 99900)).toHaveLength(1); // no duplicate point
  });

  it('archives instead of deleting, and the admin list still shows it', async () => {
    const { body } = await asAdmin(request(app).post('/admin/products')).send(valid).expect(201);
    const archived = await asAdmin(request(app).delete(`/admin/products/${body.id}`)).expect(200);
    expect(archived.body.status).toBe('ARCHIVED');
    const list = await asAdmin(request(app).get('/admin/products')).expect(200);
    expect(list.body.items).toHaveLength(1);
    const onlyArchived = await asAdmin(request(app).get('/admin/products?status=ARCHIVED')).expect(200);
    expect(onlyArchived.body.items).toHaveLength(1);
    await asAdmin(request(app).put('/admin/products/nope')).send(valid).expect(404);
  });

  it('shows a limited-time deal only while it is running', async () => {
    const live = await asAdmin(request(app).post('/admin/products')).send({ ...valid, deal: { endsInHours: 5, claimedPct: 40 } }).expect(201);
    expect(live.body.deal.claimedPct).toBe(40);
    expect(new Date(live.body.deal.endsAt).getTime()).toBeGreaterThan(Date.now());

    await Product.updateOne({ _id: live.body.id }, { 'deal.endsAt': new Date(Date.now() - 1000) });
    const expired = await request(app).get(`/products/${live.body.id}`).expect(200);
    expect(expired.body.deal).toBeUndefined();

    const removed = await asAdmin(request(app).put(`/admin/products/${live.body.id}`)).send({ ...valid, deal: null }).expect(200);
    expect(removed.body.deal).toBeUndefined();
  });
});

describe('empty store', () => {
  it('starts with no products: nothing is preloaded, only what an admin adds', async () => {
    const res = await request(app).get('/products').expect(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('category filter', () => {
  it('returns only the requested category and rejects unknown ones', async () => {
    await asAdmin(request(app).post('/admin/products')).send({ ...valid, title: 'Sofa', category: 'furniture' }).expect(201);
    await asAdmin(request(app).post('/admin/products')).send({ ...valid, title: 'Novel', category: 'books' }).expect(201);
    const books = await request(app).get('/products?category=books').expect(200);
    expect(books.body.items.map((p: { title: string }) => p.title)).toEqual(['Novel']);
    expect(books.body.items[0].category).toBe('books');
    await request(app).get('/products?category=toys').expect(400);
    await asAdmin(request(app).post('/admin/products')).send({ ...valid, category: undefined }).expect(400);
  });
});

describe('sample catalogue (seed data)', () => {
  it('has 100 unique, valid products: 20 in each category', () => {
    expect(SEED_PRODUCTS).toHaveLength(100);
    expect(new Set(SEED_PRODUCTS.map((p) => p.id)).size).toBe(100);
    for (const c of CATEGORIES) expect(SEED_PRODUCTS.filter((p) => p.category === c)).toHaveLength(20);
    for (const p of SEED_PRODUCTS) {
      const parsed = productInput.safeParse({ ...p, status: 'ACTIVE', deal: null });
      expect(parsed.success, p.id + ': ' + JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(p.moments.every(Boolean), p.id + ' has a moment code that is not mapped').toBe(true);
      expect(p.priceHistory).toHaveLength(12);
      expect(p.priceHistory.at(-1)).toBe(p.price);
    }
  });

  it('loads into the database once and never overwrites an admin edit', async () => {
    expect(await seedProducts()).toEqual({ inserted: 100, skipped: 0 });
    const all = await request(app).get('/products').expect(200);
    expect(all.body.items).toHaveLength(100);
    for (const c of CATEGORIES) {
      const res = await request(app).get('/products?category=' + c).expect(200);
      expect(res.body.items).toHaveLength(20);
    }
    expect(all.body.items.some((p: { deal?: unknown }) => p.deal)).toBe(true); // deal radar has content
    expect(all.body.items.some((p: { stock: number }) => p.stock === 0)).toBe(true); // a sold-out card exists

    // an admin changes a price; running the seed again must not undo it
    const first = all.body.items[0];
    await asAdmin(request(app).put('/admin/products/' + first.id)).send({ ...first, deal: null, price: first.price - 100 }).expect(200);
    expect(await seedProducts()).toEqual({ inserted: 0, skipped: 100 });
    const after = await request(app).get('/products/' + first.id).expect(200);
    expect(after.body.price).toBe(first.price - 100);
  });
});

describe('lookup by ids', () => {
  it('returns only the requested products', async () => {
    const a = (await asAdmin(request(app).post('/admin/products')).send({ ...valid, title: 'A one' }).expect(201)).body.id;
    const b = (await asAdmin(request(app).post('/admin/products')).send({ ...valid, title: 'B two' }).expect(201)).body.id;
    await asAdmin(request(app).post('/admin/products')).send({ ...valid, title: 'C three' }).expect(201);
    const res = await request(app).get('/products').query({ ids: a + ',' + b + ',missing' }).expect(200);
    expect(res.body.items.map((p: { id: string }) => p.id).sort()).toEqual([a, b].sort());
  });
});

describe('admin stock edit', () => {
  it('sets the stock count, admins only, never negative', async () => {
    const { body } = await asAdmin(request(app).post('/admin/products')).send({ ...valid, stock: 5 }).expect(201);
    const res = await asAdmin(request(app).patch('/admin/products/' + body.id + '/stock')).send({ stock: 42 }).expect(200);
    expect(res.body.stock).toBe(42);
    await asAdmin(request(app).patch('/admin/products/' + body.id + '/stock')).send({ stock: -1 }).expect(400);
    await asAdmin(request(app).patch('/admin/products/' + body.id + '/stock')).send({ stock: 1.5 }).expect(400);
    await request(app).patch('/admin/products/' + body.id + '/stock').send({ stock: 1 }).expect(401);
    await request(app).patch('/admin/products/' + body.id + '/stock').set('Authorization', 'Bearer ' + buyerToken).send({ stock: 1 }).expect(403);
    await asAdmin(request(app).patch('/admin/products/nope/stock')).send({ stock: 1 }).expect(404);
  });
});

describe('internal stock reservation', () => {
  const key = (r: request.Test) => r.set('X-Internal-Key', INTERNAL_KEY);
  const stockOf = async (id: string) => (await Product.findById(id))!.stock;
  const make = async (title: string, stock: number) => (await asAdmin(request(app).post('/admin/products')).send({ ...valid, title, stock }).expect(201)).body.id as string;

  it('is closed without the right key, and off when no key is configured', async () => {
    const id = await make('Guarded', 3);
    const body = { orderId: 'o-1', items: [{ productId: id, qty: 1 }] };
    await request(internalApp).post('/internal/stock/reserve').send(body).expect(401);
    await request(internalApp).post('/internal/stock/reserve').set('X-Internal-Key', 'wrong-key-wrong-key').send(body).expect(401);
    await request(app).post('/internal/stock/reserve').set('X-Internal-Key', INTERNAL_KEY).send(body).expect(503);
    expect(await stockOf(id)).toBe(3);
    // a normal user token is not an internal key
    await request(internalApp).post('/internal/stock/reserve').set('Authorization', 'Bearer ' + adminToken).send(body).expect(401);
  });

  it('takes stock, and a repeat call for the same order takes nothing more', async () => {
    const id = await make('Kettle', 10);
    const body = { orderId: 'o-2', items: [{ productId: id, qty: 3 }] };
    await key(request(internalApp).post('/internal/stock/reserve')).send(body).expect(200);
    await key(request(internalApp).post('/internal/stock/reserve')).send(body).expect(200);
    expect(await stockOf(id)).toBe(7);
  });

  it('is all-or-nothing: if one product is short, nothing is taken', async () => {
    const plenty = await make('Plenty', 10);
    const scarce = await make('Scarce', 1);
    const res = await key(request(internalApp).post('/internal/stock/reserve'))
      .send({ orderId: 'o-3', items: [{ productId: plenty, qty: 4 }, { productId: scarce, qty: 2 }] })
      .expect(409);
    expect(res.body.code).toBe('OUT_OF_STOCK');
    expect(res.body.detail).toMatch(/Only 1 of/);
    expect(await stockOf(plenty)).toBe(10);
    expect(await stockOf(scarce)).toBe(1);
    expect(await StockReservation.countDocuments()).toBe(0);
  });

  it('never oversells the last unit when buyers arrive at the same moment', async () => {
    const id = await make('Last one', 1);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        key(request(internalApp).post('/internal/stock/reserve')).send({ orderId: 'race-' + i, items: [{ productId: id, qty: 1 }] }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await stockOf(id)).toBe(0);
  });

  it('adds the same product from several lines together and refuses hidden products', async () => {
    const id = await make('Twice', 5);
    await key(request(internalApp).post('/internal/stock/reserve')).send({ orderId: 'o-4', items: [{ productId: id, qty: 2 }, { productId: id, qty: 2 }] }).expect(200);
    expect(await stockOf(id)).toBe(1);
    const draft = (await asAdmin(request(app).post('/admin/products')).send({ ...valid, stock: 9, status: 'DRAFT' }).expect(201)).body.id;
    await key(request(internalApp).post('/internal/stock/reserve')).send({ orderId: 'o-5', items: [{ productId: draft, qty: 1 }] }).expect(409);
  });

  it('puts stock back exactly once when released', async () => {
    const id = await make('Returnable', 10);
    await key(request(internalApp).post('/internal/stock/reserve')).send({ orderId: 'o-6', items: [{ productId: id, qty: 4 }] }).expect(200);
    expect(await stockOf(id)).toBe(6);
    const first = await key(request(internalApp).post('/internal/stock/release')).send({ orderId: 'o-6' }).expect(200);
    const second = await key(request(internalApp).post('/internal/stock/release')).send({ orderId: 'o-6' }).expect(200);
    expect(first.body.released).toBe(true);
    expect(second.body.released).toBe(false);
    expect(await stockOf(id)).toBe(10); // not 14
    // a released order cannot take stock again
    await key(request(internalApp).post('/internal/stock/reserve')).send({ orderId: 'o-6', items: [{ productId: id, qty: 4 }] }).expect(409);
    const unknown = await key(request(internalApp).post('/internal/stock/release')).send({ orderId: 'never-reserved' }).expect(200);
    expect(unknown.body.released).toBe(false);
  });
});
