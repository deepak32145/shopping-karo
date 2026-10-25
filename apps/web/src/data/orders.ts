export type OrderStatus = 'PAYMENT_PENDING' | 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentMethod = 'CARD' | 'UPI' | 'COD';
export type PaymentStatus = 'NOT_STARTED' | 'FAILED' | 'PAID' | 'PAY_ON_DELIVERY' | 'REFUNDED';

export interface OrderItem {
  productId: string;
  title: string;
  seller: string;
  emoji: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface PaymentView {
  method: PaymentMethod | null;
  status: PaymentStatus;
  detail?: string | null;
  failureReason?: string | null;
  paidAt?: string | null;
}

export interface StatusChange {
  status: OrderStatus;
  at: string;
  by: string;
  note?: string | null;
}

/** An order as returned by order-service. Money is integer paise. */
export interface Order {
  id: string;
  orderNumber: string;
  userEmail: string;
  status: OrderStatus;
  items: OrderItem[];
  address: ShippingAddress;
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  payment: PaymentView;
  history: StatusChange[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export interface OrderStats {
  byStatus: Partial<Record<OrderStatus, number>>;
  ordersToday: number;
  revenueToday: number;
  revenueTotal: number;
  needAttention: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PAYMENT_PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const STATUS_ORDER: OrderStatus[] = ['PAYMENT_PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

/** The steps a healthy order walks through. */
export const JOURNEY: OrderStatus[] = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];

/** What an admin may do next (mirrors the server's rules; the server is the authority). */
export const ADMIN_NEXT: Record<OrderStatus, { to: OrderStatus; label: string; danger?: boolean }[]> = {
  PAYMENT_PENDING: [{ to: 'CANCELLED', label: 'Cancel order', danger: true }],
  CONFIRMED: [{ to: 'PACKED', label: 'Mark packed' }, { to: 'CANCELLED', label: 'Cancel order', danger: true }],
  PACKED: [{ to: 'SHIPPED', label: 'Mark shipped' }, { to: 'CANCELLED', label: 'Cancel order', danger: true }],
  SHIPPED: [{ to: 'DELIVERED', label: 'Mark delivered' }],
  DELIVERED: [],
  CANCELLED: [],
};

export const CUSTOMER_CAN_CANCEL: OrderStatus[] = ['PAYMENT_PENDING', 'CONFIRMED', 'PACKED'];

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  NOT_STARTED: 'Not paid',
  FAILED: 'Payment failed',
  PAID: 'Paid',
  PAY_ON_DELIVERY: 'Pay on delivery',
  REFUNDED: 'Refunded',
};

export interface Address {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  type: 'HOME' | 'WORK' | 'OTHER';
  isDefault: boolean;
}

export type AddressInput = Omit<Address, 'id' | 'isDefault'> & { makeDefault?: boolean };

/** Same rule as the server (order-service). Shown in the cart and at checkout; the server's total is what is charged. */
export const FREE_SHIPPING_AT = 49900;
export const SHIPPING_FEE = 4900;
export const shippingFor = (subtotal: number) => (subtotal >= FREE_SHIPPING_AT ? 0 : SHIPPING_FEE);
