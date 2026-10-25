import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '@sk/node-common';
import { releaseStock, reserveStock } from './stock.service';

const itemSchema = z.object({ productId: z.string().trim().min(1).max(64), qty: z.number().int().min(1).max(99) });
const reserveBody = z.object({ orderId: z.string().trim().min(1).max(64), items: z.array(itemSchema).min(1).max(50) });
const releaseBody = z.object({ orderId: z.string().trim().min(1).max(64) });

/**
 * Service-to-service calls (order-service). Guarded by a shared secret instead of a user token, and switched off
 * entirely when no secret is configured, so a missing setting can never leave these endpoints open.
 */
export function internalRoutes(internalKey: string | undefined): Router {
  const router = Router();

  const guard: RequestHandler = (req, _res, next) => {
    if (!internalKey) return next(new HttpError(503, 'INTERNAL_API_DISABLED', 'Internal API is not configured'));
    const given = Buffer.from(req.header('x-internal-key') ?? '');
    const expected = Buffer.from(internalKey);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Invalid internal key'));
    }
    next();
  };

  router.post('/internal/stock/reserve', guard, async (req, res) => {
    const body = reserveBody.parse(req.body);
    await reserveStock(body.orderId, body.items);
    res.status(200).json({ orderId: body.orderId, status: 'RESERVED' });
  });

  router.post('/internal/stock/release', guard, async (req, res) => {
    const body = releaseBody.parse(req.body);
    res.json({ orderId: body.orderId, released: await releaseStock(body.orderId) });
  });

  return router;
}
