import { Schema, model } from 'mongoose';

export const MAX_QTY_PER_LINE = 99;
export const MAX_LINES = 50;

export interface CartLine {
  productId: string;
  qty: number;
}

/**
 * One cart per user, keyed by the user id from the token. Only product ids and quantities are stored:
 * prices and stock always come from catalog-service at read time, so a cart never holds a stale price.
 * optimisticConcurrency makes two simultaneous edits fail loudly (VersionError) instead of overwriting each other.
 */
const cartSchema = new Schema(
  {
    _id: { type: String },
    lines: { type: [new Schema({ productId: { type: String, required: true }, qty: { type: Number, required: true, min: 1, max: MAX_QTY_PER_LINE } }, { _id: false })], default: [] },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return { lines: ret.lines, updatedAt: ret.updatedAt };
      },
    },
  },
);

export const Cart = model('Cart', cartSchema);
