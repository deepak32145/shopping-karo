import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { createAuth, createTestIssuer, type TestIssuer } from '@sk/node-common';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { Cart } from '../src/cart.model';

let container: StartedMongoDBContainer;
let issuer: TestIssuer;
let app: ReturnType<typeof createApp>;
let alice: string;
let bob: string;

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:7').start();
  await mongoose.connect(`${container.getConnectionString()}/sk_cart_test`, { directConnection: true });
  await Cart.init();
  issuer = await createTestIssuer();
  app = createApp(createAuth({ keys: issuer.keys, issuer: issuer.issuer }));
  alice = await issuer.sign('alice');
  bob = await issuer.sign('bob');
});

afterAll(async () => {
  await mongoose.disconnect();
  await container?.stop();
});

beforeEach(async () => {
  await Cart.deleteMany({});
});

const as = (token: string, r: request.Test) => r.set('Authorization', `Bearer ${token}`);

describe('cart', () => {
  it('requires a signed-in user', async () => {
    await request(app).get('/cart').expect(401);
    await request(app).post('/cart/items').send({ productId: 'p1' }).expect(401);
    await request(app).get('/cart').set('Authorization', 'Bearer garbage').expect(401);
  });

  it('starts empty and remembers what was added, as the same user comes back later', async () => {
    const empty = await as(alice, request(app).get('/cart')).expect(200);
    expect(empty.body.lines).toEqual([]);

    await as(alice, request(app).post('/cart/items')).send({ productId: 'p1' }).expect(200);
    await as(alice, request(app).post('/cart/items')).send({ productId: 'p2', qty: 3 }).expect(200);

    // "log in again": a brand-new token for the same user sees the saved cart
    const returning = await issuer.sign('alice');
    const res = await as(returning, request(app).get('/cart')).expect(200);
    expect(res.body.lines).toEqual([{ productId: 'p1', qty: 1 }, { productId: 'p2', qty: 3 }]);
  });

  it('adds to an existing line, caps at 99, sets exact quantities and removes with 0', async () => {
    await as(alice, request(app).post('/cart/items')).send({ productId: 'p1', qty: 2 }).expect(200);
    const added = await as(alice, request(app).post('/cart/items')).send({ productId: 'p1', qty: 3 }).expect(200);
    expect(added.body.lines).toEqual([{ productId: 'p1', qty: 5 }]);

    const capped = await as(alice, request(app).post('/cart/items')).send({ productId: 'p1', qty: 99 }).expect(200);
    expect(capped.body.lines[0].qty).toBe(99);

    const set = await as(alice, request(app).put('/cart/items/p1')).send({ qty: 4 }).expect(200);
    expect(set.body.lines).toEqual([{ productId: 'p1', qty: 4 }]);

    const gone = await as(alice, request(app).put('/cart/items/p1')).send({ qty: 0 }).expect(200);
    expect(gone.body.lines).toEqual([]);
  });

  it('removes one product and clears the whole cart', async () => {
    await as(alice, request(app).post('/cart/items')).send({ productId: 'p1' });
    await as(alice, request(app).post('/cart/items')).send({ productId: 'p2' });
    const one = await as(alice, request(app).delete('/cart/items/p1')).expect(200);
    expect(one.body.lines).toEqual([{ productId: 'p2', qty: 1 }]);
    const cleared = await as(alice, request(app).delete('/cart')).expect(200);
    expect(cleared.body.lines).toEqual([]);
  });

  it('keeps carts private to each user', async () => {
    await as(alice, request(app).post('/cart/items')).send({ productId: 'p1' });
    const bobs = await as(bob, request(app).get('/cart')).expect(200);
    expect(bobs.body.lines).toEqual([]);
    await as(bob, request(app).post('/cart/items')).send({ productId: 'p9' });
    const alices = await as(alice, request(app).get('/cart')).expect(200);
    expect(alices.body.lines).toEqual([{ productId: 'p1', qty: 1 }]);
  });

  it('merges a guest cart into the saved cart by summing quantities', async () => {
    await as(alice, request(app).post('/cart/items')).send({ productId: 'p1', qty: 2 });
    const res = await as(alice, request(app).post('/cart/merge'))
      .send({ lines: [{ productId: 'p1', qty: 1 }, { productId: 'p7', qty: 4 }] })
      .expect(200);
    expect(res.body.lines).toEqual([{ productId: 'p1', qty: 3 }, { productId: 'p7', qty: 4 }]);
  });

  it('rejects bad input', async () => {
    for (const body of [{ productId: '' }, { productId: 'p1', qty: 0 }, { productId: 'p1', qty: 100 }, { productId: 'p1', qty: 1.5 }, { productId: '<script>' }]) {
      const res = await as(alice, request(app).post('/cart/items')).send(body).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
    await as(alice, request(app).put('/cart/items/p1')).send({ qty: -1 }).expect(400);
    await as(alice, request(app).post('/cart/merge')).send({ lines: [{ productId: 'p1', qty: 0 }] }).expect(400);
  });

  it('refuses a cart with more than 50 different products', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ productId: `p${i}`, qty: 1 }));
    await as(alice, request(app).post('/cart/merge')).send({ lines }).expect(200);
    const res = await as(alice, request(app).post('/cart/items')).send({ productId: 'one-too-many' }).expect(400);
    expect(res.body.code).toBe('CART_FULL');
  });

  it('does not lose items when many adds happen at the same moment', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => as(alice, request(app).post('/cart/items')).send({ productId: `p${i}` }).expect(200)));
    const res = await as(alice, request(app).get('/cart')).expect(200);
    expect(res.body.lines.map((l: { productId: string }) => l.productId).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `p${i}`).sort());
  });
});
