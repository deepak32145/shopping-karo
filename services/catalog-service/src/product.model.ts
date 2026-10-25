import { randomUUID } from 'node:crypto';
import { Schema, model, type InferSchemaType } from 'mongoose';

export const MOMENTS = ['festive', 'hostel', 'gifting', 'monsoon', 'wfh', 'kitchen'] as const;
/** Top-level departments. Adding one means adding it here, in the web app's category list, and in the admin form. */
export const CATEGORIES = ['electronics', 'furniture', 'beauty', 'books', 'fashion'] as const;
export type Category = (typeof CATEGORIES)[number];
export const STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED'] as const;
export const HISTORY_POINTS = 12;

const isInt = { validator: Number.isInteger, message: '{PATH} must be a whole number' };

const productSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    seller: { type: String, required: true, trim: true, maxlength: 80 },
    /** All money is integer paise, same as the Java services. */
    price: { type: Number, required: true, min: 1, validate: isInt },
    mrp: { type: Number, required: true, min: 1, validate: isInt },
    stock: { type: Number, required: true, min: 0, default: 0, validate: isInt },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviews: { type: Number, min: 0, default: 0, validate: isInt },
    emoji: { type: String, default: '🛍️', maxlength: 16 },
    hue: { type: Number, min: 0, max: 360, default: 20 },
    category: { type: String, enum: CATEGORIES, required: true, index: true },
    moments: { type: [{ type: String, enum: MOMENTS }], default: [] },
    keywords: { type: String, default: '', maxlength: 200 },
    status: { type: String, enum: STATUSES, default: 'ACTIVE', index: true },
    /** One entry whenever the price changes: the source of the price chart and "lowest in 90 days". */
    priceHistory: { type: [new Schema({ price: Number, at: Date }, { _id: false })], default: [] },
    deal: { type: new Schema({ endsAt: Date, claimedPct: { type: Number, min: 0, max: 100 } }, { _id: false }), default: undefined },
    createdBy: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: false,
      transform(_doc, ret: Record<string, unknown>) {
        const prices = ((ret.priceHistory as { price: number }[]) ?? []).map((p) => p.price);
        const last = prices.slice(-HISTORY_POINTS);
        // Pad on the left so the chart always has HISTORY_POINTS points, even for a brand-new product.
        const padValue = last[0] ?? (ret.price as number);
        const history = [...Array(Math.max(0, HISTORY_POINTS - last.length)).fill(padValue), ...last];

        const deal = ret.deal as { endsAt: Date; claimedPct: number } | undefined;
        const liveDeal = deal && deal.endsAt.getTime() > Date.now() ? { endsAt: deal.endsAt.toISOString(), claimedPct: deal.claimedPct } : undefined;

        ret.id = ret._id;
        ret.history = history;
        ret.deal = liveDeal;
        delete ret._id;
        delete ret.__v;
        delete ret.priceHistory;
        return ret;
      },
    },
  },
);

productSchema.index({ status: 1, createdAt: 1 });

export type ProductDoc = InferSchemaType<typeof productSchema> & { _id: string };
export const Product = model('Product', productSchema);
