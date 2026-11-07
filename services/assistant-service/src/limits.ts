/** In-memory abuse limits. Fine for one instance; behind several, move the counters to Redis. */

const SWEEP_AT = 10_000;

/** At most `limit` hits per key in any `windowMs`. */
export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit. `retryAfterSec` is set when it was refused. */
  hit(key: string, limit: number): { ok: true } | { ok: false; retryAfterSec: number } {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => t - at < this.windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > SWEEP_AT) this.sweep(t);
    return { ok: true };
  }

  private sweep(t: number): void {
    for (const [key, list] of this.hits) if (list.every((at) => t - at >= this.windowMs)) this.hits.delete(key);
  }
}

/** Counts off-topic or hostile messages; too many in a short time earns a cool-down. */
export class Strikes {
  private readonly counts = new Map<string, number[]>();
  private readonly until = new Map<string, number>();

  constructor(
    private readonly maxStrikes: number,
    private readonly windowMs: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  add(key: string): void {
    const t = this.now();
    const recent = (this.counts.get(key) ?? []).filter((at) => t - at < this.windowMs);
    recent.push(t);
    this.counts.set(key, recent);
    if (recent.length >= this.maxStrikes) {
      this.until.set(key, t + this.cooldownMs);
      this.counts.delete(key);
    }
    if (this.counts.size + this.until.size > SWEEP_AT) this.sweep(t);
  }

  /** Seconds left in the cool-down, or 0. */
  coolingDown(key: string): number {
    const end = this.until.get(key);
    if (!end) return 0;
    const left = end - this.now();
    if (left <= 0) {
      this.until.delete(key);
      return 0;
    }
    return Math.ceil(left / 1000);
  }

  private sweep(t: number): void {
    for (const [key, end] of this.until) if (end <= t) this.until.delete(key);
    for (const [key, list] of this.counts) if (list.every((at) => t - at >= this.windowMs)) this.counts.delete(key);
  }
}

/** Tokens the assistant may spend per UTC day, across everyone. When it runs out the assistant rests until midnight UTC. */
export class DailyBudget {
  private day = '';
  private used = 0;

  constructor(
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  exhausted(): boolean {
    this.roll();
    return this.used >= this.limit;
  }

  add(tokens: number): void {
    this.roll();
    this.used += tokens;
  }

  private roll(): void {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
  }
}

/** One answer at a time per person: stops a script from opening dozens of parallel, paid requests. */
export class InFlight {
  private readonly active = new Set<string>();

  tryEnter(key: string): boolean {
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }

  leave(key: string): void {
    this.active.delete(key);
  }
}
