import { Schema, model } from 'mongoose';

export interface ReservedItem {
  productId: string;
  qty: number;
}

/**
 * Remembers which stock an order took, so that releasing it (cancel / payment expiry) puts back exactly that amount,
 * and doing it twice puts it back only once. Keyed by order id: a retried reserve call for the same order is a no-op.
 */
const reservationSchema = new Schema(
  {
    _id: { type: String }, // order id
    items: { type: [new Schema({ productId: String, qty: Number }, { _id: false })], required: true },
    status: { type: String, enum: ['RESERVED', 'RELEASED'], required: true },
  },
  { timestamps: true },
);

export const StockReservation = model('StockReservation', reservationSchema);
