import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';

/** A chat held on the server. The browser only ever sends its new message, never the history, so it cannot forge earlier turns. */
export interface Conversation {
  id: string;
  /** Who started it (user id or IP). Another person presenting this id gets a fresh conversation instead. */
  owner: string;
  /** Append-only: each turn adds to the end and nothing is edited or trimmed, which keeps the model's own earlier reasoning valid. */
  messages: Anthropic.MessageParam[];
  turns: number;
  touchedAt: number;
  /** Shown in the user's chat history; set from their first question. */
  title?: string;
}

export const MAX_TURNS = 12;
const TTL_MS = 30 * 60_000;
const MAX_CONVERSATIONS = 5_000;

export class ConversationStore {
  private readonly byId = new Map<string, Conversation>();

  constructor(private readonly now: () => number = Date.now) {}

  open(owner: string, id?: string): Conversation {
    const t = this.now();
    const found = id ? this.byId.get(id) : undefined;
    if (found && found.owner === owner && t - found.touchedAt < TTL_MS) {
      found.touchedAt = t;
      return found;
    }
    if (this.byId.size >= MAX_CONVERSATIONS) this.evict(t);
    const fresh: Conversation = { id: randomUUID(), owner, messages: [], turns: 0, touchedAt: t };
    this.byId.set(fresh.id, fresh);
    return fresh;
  }

  private evict(t: number): void {
    for (const [id, c] of this.byId) if (t - c.touchedAt >= TTL_MS) this.byId.delete(id);
    // Still full of live chats: drop the oldest-created (a Map iterates in insertion order).
    while (this.byId.size >= MAX_CONVERSATIONS) {
      const oldest = this.byId.keys().next().value;
      if (oldest === undefined) break;
      this.byId.delete(oldest);
    }
  }
}
