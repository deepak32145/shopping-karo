import { useEffect, useState } from 'react';
import type { Product } from '../data/products';
import { discountPct, formatINR } from '../lib';

interface Props {
  deals: Product[];
  /** Absent for the admin account: deals are then shown without a buy button. */
  onAdd?: (id: string) => void;
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${days > 0 ? `${days}d ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function DealRadar({ deals, onAdd }: Props) {
  const now = useNow();
  const live = deals
    .filter((p) => p.deal && new Date(p.deal.endsAt).getTime() > now)
    .sort((a, b) => new Date(a.deal!.endsAt).getTime() - new Date(b.deal!.endsAt).getTime());
  if (live.length === 0) return null;

  return (
    <section className="section radar">
      <div className="section-head">
        <h2><span className="live-dot" aria-hidden="true" /> Deal radar</h2>
        <p className="muted">Limited-time prices. When the bar fills, the deal ends.</p>
      </div>
      <div className="radar-row">
        {live.map((p) => {
          const deal = p.deal!;
          const hot = deal.claimedPct >= 70;
          const soldOut = p.stock <= 0;
          return (
            <article key={p.id} className="deal" style={{ ['--hue' as string]: p.hue }}>
              <div className="deal-top">
                <span className="deal-emoji" aria-hidden="true">{p.emoji}</span>
                <span className="timer" aria-label="Time left">{countdown(new Date(deal.endsAt).getTime() - now)}</span>
              </div>
              <h3>{p.title}</h3>
              <p className="deal-price">
                <b>{formatINR(p.price)}</b> <span className="mrp">{formatINR(p.mrp)}</span> <span className="off">-{discountPct(p)}%</span>
              </p>
              <div className="meter" role="progressbar" aria-valuenow={deal.claimedPct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${deal.claimedPct}%` }} className={hot ? 'hot' : ''} />
              </div>
              <p className="meter-label">{hot ? '🔥 Almost gone — ' : ''}{deal.claimedPct}% claimed</p>
              {onAdd && (
                <button className="btn btn-dark btn-block" onClick={() => onAdd(p.id)} disabled={soldOut}>
                  {soldOut ? 'Sold out' : 'Grab it'}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
