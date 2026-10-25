import { FormEvent, useEffect, useState } from 'react';
import { orderApi, type PayInput } from '../api';
import type { Order, PaymentMethod } from '../data/orders';
import { ApiError } from '../http';
import { formatINR } from '../lib';

interface Props {
  order: Order;
  onPaid: (order: Order) => void;
  /** Closing without paying leaves the order waiting (it expires on its own). */
  onClose: () => void;
  /** The order was cancelled or expired while the modal was open. */
  onOrderGone: (message: string) => void;
}

const METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'CARD', label: 'Card', icon: '💳' },
  { id: 'UPI', label: 'UPI', icon: '📲' },
  { id: 'COD', label: 'Cash on delivery', icon: '💵' },
];

const groupCard = (v: string) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

function useCountdown(iso: string | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const left = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

/**
 * A pretend payment page, standing in for Razorpay's hosted checkout. No money moves. The order-service's fake gateway
 * decides the outcome from the details typed here (see the test-mode hints).
 */
export default function PaymentModal({ order, onPaid, onClose, onOrderGone }: Props) {
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholder, setCardholder] = useState('');
  const [upiId, setUpiId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const countdown = useCountdown(order.expiresAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body: PayInput =
      method === 'CARD' ? { method, cardNumber, expiry, cvv, cardholder } : method === 'UPI' ? { method, upiId } : { method };
    try {
      onPaid(await orderApi.pay(order.id, body));
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'ORDER_EXPIRED' || err.code === 'NOT_PAYABLE')) {
        onOrderGone(err.message);
      } else if (err instanceof ApiError && err.code === 'PAYMENT_DECLINED' && /cancelled/i.test(err.message)) {
        onOrderGone(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'We could not reach the payment service. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="pay-title">
      <div className="scrim scrim-on" onClick={() => !busy && onClose()} />
      <form className="modal pay-modal" onSubmit={submit}>
        <button type="button" className="icon-btn modal-x" onClick={onClose} disabled={busy} aria-label="Close payment">✕</button>

        <div className="pay-demo">Demo payment: no real money is charged</div>
        <h2 id="pay-title">Pay {formatINR(order.total)}</h2>
        <p className="muted">
          Order {order.orderNumber}
          {countdown && <> · complete within <b className="pay-timer">{countdown}</b></>}
        </p>

        <div className="pay-methods" role="tablist">
          {METHODS.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={method === m.id} className={`pay-method ${method === m.id ? 'pay-method-on' : ''}`} onClick={() => { setMethod(m.id); setError(null); }}>
              <span aria-hidden="true">{m.icon}</span> {m.label}
            </button>
          ))}
        </div>

        {method === 'CARD' && (
          <div className="pay-fields">
            <label className="field">Card number
              <input value={cardNumber} onChange={(e) => setCardNumber(groupCard(e.target.value))} inputMode="numeric" autoComplete="cc-number" placeholder="4111 1111 1111 1111" required />
            </label>
            <div className="pf-row">
              <label className="field">Expiry
                <input value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" required />
              </label>
              <label className="field">CVV
                <input value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="cc-csc" type="password" placeholder="123" required />
              </label>
            </div>
            <label className="field">Name on card
              <input value={cardholder} onChange={(e) => setCardholder(e.target.value)} autoComplete="cc-name" maxLength={80} />
            </label>
          </div>
        )}

        {method === 'UPI' && (
          <div className="pay-fields">
            <label className="field">UPI ID
              <input value={upiId} onChange={(e) => setUpiId(e.target.value.trim())} placeholder="yourname@okbank" required autoComplete="off" />
            </label>
          </div>
        )}

        {method === 'COD' && (
          <p className="pay-cod">
            Pay <b>{formatINR(order.total)}</b> in cash when your order arrives. Keep the exact amount ready if you can.
          </p>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? '⏳ Contacting your bank…' : method === 'COD' ? 'Place order' : `Pay ${formatINR(order.total)}`}
        </button>

        <button type="button" className="link pay-hints-toggle" onClick={() => setShowHints((s) => !s)}>
          {showHints ? 'Hide' : 'Show'} test-mode details
        </button>
        {showHints && (
          <ul className="pay-hints">
            <li><code>4111 1111 1111 1111</code> succeeds · <code>4242 4242 4242 4242</code> succeeds</li>
            <li><code>4000 0000 0000 0002</code> declined · <code>4000 0000 0000 9995</code> insufficient funds</li>
            <li>Use any future expiry and any 3-digit CVV.</li>
            <li>UPI: <code>anything@okbank</code> succeeds, <code>fail@okbank</code> is declined.</li>
          </ul>
        )}
      </form>
    </div>
  );
}
