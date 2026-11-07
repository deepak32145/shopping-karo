/**
 * The first line of defence, before any model is called: size limits, cleaning, and a cheap screen for the
 * classic prompt-injection openers. It saves money and removes the laziest attacks; it is NOT what keeps the
 * assistant on topic. That is the system prompt, the read-only tools, the output check and the rate limits.
 */

export const MAX_MESSAGE_CHARS = 500;

export const OFF_TOPIC_REPLY =
  'I can only help with Shopping Karo: finding products, your cart, checkout, payments and orders. What would you like to do?';

export type Screened = { ok: true; text: string } | { ok: false; reason: 'empty' | 'too_long' | 'blocked'; reply: string };

// Control characters (except tab/newline), zero-width and bidi-override characters: they hide text from people
// while the model still reads it.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** NFKC folds look-alike forms (full-width letters, ligatures) to plain ones, so patterns below can't be dodged with them. */
export function clean(raw: string): string {
  return raw.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

const INJECTION: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|all|any|your|the|these)\b.{0,30}\b(instructions?|prompts?|rules?|guidelines?|restrictions?|directions?)\b/i,
  /\b(reveal|show|print|repeat|output|display|leak|tell me|give me|what (is|are))\b.{0,40}\b(system|initial|hidden|original|secret)\b.{0,15}\b(prompt|instructions?|message)\b/i,
  /\b(your|the) (system prompt|hidden instructions|initial instructions|internal rules)\b/i,
  /\b(jailbreak|developer mode|god mode|do anything now|dan mode)\b/i,
  /\b(you are now|from now on you are|pretend (to be|you are)|act as if you (have no|are not)|new persona)\b/i,
  // Fake chat-protocol markers: nobody shopping needs to type these.
  /<\/?\s*(system|assistant|tool|instructions?|developer)\s*>/i,
  /\[\/?(INST|SYS|SYSTEM)\]|<\|\s*(im_start|im_end|system|endoftext)\s*\|>/i,
  /^\s*(system|assistant|developer)\s*:/i,
];

export function screen(raw: unknown): Screened {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty', reply: 'Type a question and I will help.' };
  const text = clean(raw);
  if (!text) return { ok: false, reason: 'empty', reply: 'Type a question and I will help.' };
  if (text.length > MAX_MESSAGE_CHARS) {
    return { ok: false, reason: 'too_long', reply: `Please keep your message under ${MAX_MESSAGE_CHARS} characters.` };
  }
  if (INJECTION.some((re) => re.test(text))) return { ok: false, reason: 'blocked', reply: OFF_TOPIC_REPLY };
  return { ok: true, text };
}

/**
 * Stops the model's reply from ever carrying a marker we planted in the system prompt. Text is released with a
 * short delay (the length of the marker) so a marker split across two streamed chunks is still caught.
 */
export class OutputGuard {
  private pending = '';
  private emittedAny = false;
  leaked = false;

  constructor(
    private readonly canary: string,
    private readonly emit: (text: string) => void,
  ) {}

  push(chunk: string): void {
    if (this.leaked) return;
    this.pending += chunk;
    if (this.pending.includes(this.canary)) {
      this.leaked = true;
      this.pending = '';
      return;
    }
    const safe = this.pending.length - (this.canary.length - 1);
    if (safe > 0) this.release(this.pending.slice(0, safe), safe);
  }

  /** Called between tool rounds so the next paragraph does not run into the previous one. */
  breakParagraph(): void {
    if (this.emittedAny || this.pending) this.push('\n\n');
  }

  flush(): void {
    if (this.leaked) return;
    this.release(this.pending, this.pending.length);
  }

  private release(text: string, consumed: number): void {
    this.pending = this.pending.slice(consumed);
    if (!text) return;
    this.emittedAny = true;
    this.emit(text);
  }
}
