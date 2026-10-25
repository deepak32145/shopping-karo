import { JOURNEY, STATUS_LABEL, type Order, type OrderStatus } from '../data/orders';
import { formatDateTime } from '../lib';

/** The progress bar (Confirmed → Packed → Shipped → Delivered) and the full history underneath it. */
export default function OrderTimeline({ order }: { order: Order }) {
  const reached = new Map<OrderStatus, string>(order.history.map((h) => [h.status, h.at]));
  const cancelled = order.status === 'CANCELLED';

  return (
    <div className="timeline">
      {cancelled ? (
        <p className="tl-cancelled">This order was cancelled{reached.get('CANCELLED') ? ` on ${formatDateTime(reached.get('CANCELLED')!)}` : ''}.</p>
      ) : order.status === 'PAYMENT_PENDING' ? (
        <p className="tl-waiting">Waiting for payment. Your items are held for a few minutes.</p>
      ) : (
        <ol className="tl-steps" aria-label="Order progress">
          {JOURNEY.map((s) => {
            const at = reached.get(s);
            const current = order.status === s;
            return (
              <li key={s} className={`${at ? 'tl-done' : ''} ${current ? 'tl-current' : ''}`}>
                <span className="tl-dot" aria-hidden="true">{at ? '✓' : ''}</span>
                <b>{STATUS_LABEL[s]}</b>
                <small>{at ? formatDateTime(at) : ' '}</small>
              </li>
            );
          })}
        </ol>
      )}

      <details className="tl-history">
        <summary>History</summary>
        <ul>
          {[...order.history].reverse().map((h, i) => (
            <li key={i}>
              <span className="tl-when">{formatDateTime(h.at)}</span>
              <b>{STATUS_LABEL[h.status]}</b>
              {h.note && <span className="muted"> — {h.note}</span>}
              <small className="muted"> · {h.by}</small>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
