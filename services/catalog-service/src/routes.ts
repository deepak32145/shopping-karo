import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { notFound, type Auth } from '@sk/node-common';
import { Product } from './product.model';
import { adminListQuery, listQuery, productInput, stockInput, type ProductInput } from './product.input';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter(q: { q?: string; moment?: string; category?: string; maxPrice?: number; ids?: string[] }): FilterQuery<unknown> {
  const filter: FilterQuery<unknown> = {};
  if (q.ids) filter._id = { $in: q.ids };
  if (q.moment) filter.moments = q.moment;
  if (q.category) filter.category = q.category;
  if (q.maxPrice !== undefined) filter.price = { $lte: q.maxPrice };
  if (q.q) {
    // Every word must appear in the title, seller or keywords.
    filter.$and = q.q
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => {
        const re = new RegExp(escapeRegex(w), 'i');
        return { $or: [{ title: re }, { seller: re }, { keywords: re }] };
      });
  }
  return filter;
}

function dealFrom(input: ProductInput) {
  return input.deal ? { endsAt: new Date(Date.now() + input.deal.endsInHours * 3_600_000), claimedPct: input.deal.claimedPct } : undefined;
}

export function productRoutes(auth: Auth): Router {
  const router = Router();

  // ---------- public ----------

  router.get('/products', async (req, res) => {
    const q = listQuery.parse(req.query);
    const items = await Product.find({ ...buildFilter(q), status: 'ACTIVE' }).sort({ createdAt: 1, _id: 1 }).limit(q.limit);
    res.json({ items });
  });

  router.get('/products/:id', async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, status: 'ACTIVE' });
    if (!product) throw notFound('Product');
    res.json(product);
  });

  // ---------- admin ----------

  const admin = auth.requireRole('ADMIN');

  router.get('/admin/products', ...admin, async (req, res) => {
    const q = adminListQuery.parse(req.query);
    const items = await Product.find({ ...buildFilter(q), ...(q.status ? { status: q.status } : {}) })
      .sort({ createdAt: -1, _id: 1 })
      .limit(q.limit);
    res.json({ items });
  });

  router.post('/admin/products', ...admin, async (req, res) => {
    const input = productInput.parse(req.body);
    const { deal: _deal, ...fields } = input;
    const product = await Product.create({
      ...fields,
      deal: dealFrom(input),
      priceHistory: [{ price: input.price, at: new Date() }],
      createdBy: req.user!.id,
    });
    res.status(201).json(product);
  });

  /** Full replace of the editable fields. A price change is recorded in the price history. */
  router.put('/admin/products/:id', ...admin, async (req, res) => {
    const input = productInput.parse(req.body);
    const product = await Product.findById(req.params.id);
    if (!product) throw notFound('Product');

    const { deal: _deal, ...fields } = input;
    if (product.price !== input.price) {
      product.priceHistory.push({ price: input.price, at: new Date() });
    }
    product.set({ ...fields, deal: dealFrom(input) });
    await product.save();
    res.json(product);
  });

  /** Sets the stock count only, for the inventory table. */
  router.patch('/admin/products/:id/stock', ...admin, async (req, res) => {
    const { stock } = stockInput.parse(req.body);
    const product = await Product.findByIdAndUpdate(req.params.id, { stock }, { new: true });
    if (!product) throw notFound('Product');
    res.json(product);
  });

  /** Products are archived, not deleted, so past orders can still refer to them. */
  router.delete('/admin/products/:id', ...admin, async (req, res) => {
    const product = await Product.findByIdAndUpdate(req.params.id, { status: 'ARCHIVED' }, { new: true });
    if (!product) throw notFound('Product');
    res.json(product);
  });

  return router;
}
