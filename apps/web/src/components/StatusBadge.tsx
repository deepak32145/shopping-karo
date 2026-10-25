import { PAYMENT_LABEL, STATUS_LABEL, type OrderStatus, type PaymentStatus } from '../data/orders';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge st-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`pay-badge pb-${status.toLowerCase()}`}>{PAYMENT_LABEL[status]}</span>;
}
