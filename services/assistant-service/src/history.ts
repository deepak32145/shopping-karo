import { Schema, model } from 'mongoose';
import type Anthropic from '@anthropic-ai/sdk';
import type { Conversation } from './conversations';

export interface ChatSummary {
  id: string;
  title: string;
  turns: number;
  updatedAt: string;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Where a signed-in user's chats are kept between visits. Every call is scoped to one user. */
export interface ChatHistory {
  /** A new, empty conversation. Nothing is stored until the first answer succeeds and `save` is called. */
  create(userId: string): Conversation;
  load(userId: string, id: string): Promise<Conversation | null>;
  save(userId: string, conv: Conversation): Promise<void>;
  list(userId: string): Promise<ChatSummary[]>;
  remove(userId: string, id: string): Promise<boolean>;
}

const MAX_LISTED = 30;

const schema = new Schema(
  {
    _id: { type: String },
    userId: { type: String, required: true },
    title: { type: String, default: 'New chat', maxlength: 80 },
    turns: { type: Number, default: 0 },
    /**
     * The exact messages sent to the model, tool calls and results included, so a chat can be resumed where it
     * stopped. Mixed on purpose: the shapes belong to the Anthropic API and must come back unchanged.
     */
    messages: { type: [Schema.Types.Mixed], default: [] },
  },
  // minimize:false keeps empty objects: a tool call with no arguments is `input: {}` and must still have an input.
  { timestamps: true, minimize: false },
);
schema.index({ userId: 1, updatedAt: -1 });

const ChatDoc = model('AssistantChat', schema);

export class MongoHistory implements ChatHistory {
  create(userId: string): Conversation {
    return { id: crypto.randomUUID(), owner: `u:${userId}`, messages: [], turns: 0, touchedAt: Date.now() };
  }

  async load(userId: string, id: string): Promise<Conversation | null> {
    const doc = await ChatDoc.findOne({ _id: id, userId }).lean();
    if (!doc) return null;
    return { id, owner: `u:${userId}`, messages: doc.messages as Anthropic.MessageParam[], turns: doc.turns, touchedAt: Date.now(), title: doc.title };
  }

  async save(userId: string, conv: Conversation): Promise<void> {
    await ChatDoc.updateOne({ _id: conv.id, userId }, { $set: { title: conv.title ?? 'New chat', turns: conv.turns, messages: conv.messages } }, { upsert: true });
  }

  async list(userId: string): Promise<ChatSummary[]> {
    const docs = await ChatDoc.find({ userId }).sort({ updatedAt: -1 }).limit(MAX_LISTED).select('title turns updatedAt').lean();
    return docs.map((d) => ({ id: String(d._id), title: d.title, turns: d.turns, updatedAt: (d.updatedAt as Date).toISOString() }));
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const res = await ChatDoc.deleteOne({ _id: id, userId });
    return res.deletedCount > 0;
  }
}

/**
 * What the customer saw: their questions and the assistant's replies. Tool calls and results, and the model's
 * private reasoning, are left out. A reply that took several model calls is one bubble, as it was on screen.
 */
export function toTranscript(messages: Anthropic.MessageParam[]): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  let reply: string[] = [];
  const flush = () => {
    if (reply.length) out.push({ role: 'assistant', text: reply.join('\n\n') });
    reply = [];
  };
  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content !== 'string') continue; // a tool result, not something the customer typed
      flush();
      out.push({ role: 'user', text: m.content });
    } else if (Array.isArray(m.content)) {
      let text = '';
      for (const block of m.content) if (block.type === 'text') text += block.text;
      if (text.trim()) reply.push(text.trim());
    }
  }
  flush();
  return out;
}
