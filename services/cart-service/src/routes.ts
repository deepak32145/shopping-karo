import { Router } from 'express';
import { z } from 'zod';
import type { Auth } from '@sk/node-common';
import { MAX_LINES, MAX_QTY_PER_LINE } from './cart.model';
import { cartService } from './cart.service';

const productId = z.string().trim().min(1).max(64).regex(/^[\w-]+$/, 'must be a valid product id');
const qty = z.number().int().min(1).max(MAX_QTY_PER_LINE);

const addBody = z.object({ productId, qty: qty.default(1) });
const setBody = z.object({ qty: z.number().int().min(0).max(MAX_QTY_PER_LINE) });
const mergeBody = z.object({ lines: z.array(z.object({ productId, qty })).max(MAX_LINES) });

export function cartRoutes(auth: Auth): Router {
  const router = Router();
  router.use('/cart', auth.authenticate); // every cart is private to the signed-in user

  router.get('/cart', async (req, res) => {
    res.json(await cartService.get(req.user!.id));
  });

  router.post('/cart/items', async (req, res) => {
    const body = addBody.parse(req.body);
    res.json(await cartService.add(req.user!.id, body.productId, body.qty));
  });

  router.put('/cart/items/:productId', async (req, res) => {
    const id = productId.parse(req.params.productId);
    const body = setBody.parse(req.body);
    res.json(await cartService.setQty(req.user!.id, id, body.qty));
  });

  router.delete('/cart/items/:productId', async (req, res) => {
    res.json(await cartService.remove(req.user!.id, productId.parse(req.params.productId)));
  });

  router.post('/cart/merge', async (req, res) => {
    res.json(await cartService.merge(req.user!.id, mergeBody.parse(req.body).lines));
  });

  router.delete('/cart', async (req, res) => {
    res.json(await cartService.clear(req.user!.id));
  });

  return router;
}
