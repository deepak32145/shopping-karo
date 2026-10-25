import { MomentId, moments } from '../data/products';

interface Props {
  active: MomentId | null;
  onPick: (id: MomentId | null) => void;
}

/** "Shop by moment" bento grid — discovery by occasion instead of by category tree. */
export default function Moments({ active, onPick }: Props) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>What's happening in your life?</h2>
        <p className="muted">Pick a moment. We'll gather everything for it.</p>
      </div>
      <div className="bento">
        {moments.map((m, i) => (
          <button
            key={m.id}
            className={`tile tile-${i + 1} ${active === m.id ? 'tile-on' : ''}`}
            style={{ ['--hue' as string]: m.hue }}
            onClick={() => onPick(active === m.id ? null : m.id)}
            aria-pressed={active === m.id}
          >
            <span className="tile-emoji" aria-hidden="true">{m.emoji}</span>
            <span className="tile-label">{m.label}</span>
            <span className="tile-blurb">{m.blurb}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
