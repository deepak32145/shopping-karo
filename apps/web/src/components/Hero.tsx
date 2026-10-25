import { MAX_BUDGET, formatINR } from '../lib';

interface Props {
  budget: number;
  onBudget: (b: number) => void;
  matchCount: number;
  onSeePicks: () => void;
}

const PRESETS = [500, 1000, 2500, 5000];

export default function Hero({ budget, onBudget, matchCount, onSeePicks }: Props) {
  const label = budget >= MAX_BUDGET ? 'any budget' : formatINR(budget * 100);
  const pct = ((budget - 100) / (MAX_BUDGET - 100)) * 100;

  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Delivering in Gurgaon by tomorrow, 9 pm</p>
        <h1>
          Shop by <span className="mark">budget</span>,<br />
          not by browsing.
        </h1>
        <p className="lede">
          Tell us how much you want to spend. We reshape the whole store around it, with honest price history on every item.
        </p>
      </div>

      <div className="budget-card">
        <label htmlFor="budget" className="budget-label">Today I'm spending up to</label>
        <div className="budget-value" aria-live="polite">{label}</div>
        <input
          id="budget"
          type="range"
          min={100}
          max={MAX_BUDGET}
          step={100}
          value={budget}
          onChange={(e) => onBudget(Number(e.target.value))}
          style={{ ['--pct' as string]: `${pct}%` }}
        />
        <div className="presets">
          {PRESETS.map((v) => (
            <button key={v} className={`pill ${budget === v ? 'pill-on' : ''}`} onClick={() => onBudget(v)}>
              {formatINR(v * 100)}
            </button>
          ))}
          <button className={`pill ${budget >= MAX_BUDGET ? 'pill-on' : ''}`} onClick={() => onBudget(MAX_BUDGET)}>
            Any
          </button>
        </div>
        <button className="btn btn-dark btn-block" onClick={onSeePicks}>
          Show {matchCount} {matchCount === 1 ? 'pick' : 'picks'} →
        </button>
      </div>
    </section>
  );
}
