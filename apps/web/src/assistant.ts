import { authFetch } from './auth';
import { ensureOk, parseJson } from './http';
import { parseChunk } from './stream';

export interface AssistantHandlers {
  onMeta: (conversationId: string) => void;
  /** More text for the reply being written. */
  onDelta: (text: string) => void;
  /** The server withdrew what it had shown; show this instead. */
  onReplace: (text: string) => void;
  onError: (message: string) => void;
}

/**
 * Sends one message to the shopping assistant and reads the answer as it streams in. Only the new message goes
 * up; the server keeps the conversation. Rejections (rate limit, assistant off, chat full...) throw an ApiError.
 */
export async function askAssistant(message: string, conversationId: string | null, handlers: AssistantHandlers, signal?: AbortSignal): Promise<void> {
  const res = await authFetch('/api/assistant/chat', {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
    signal,
  });
  await ensureOk(res);
  if (!res.body) throw new Error('No response');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const event = parseChunk(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (!event) continue;
      let data: { conversationId?: string; text?: string; message?: string };
      try {
        data = JSON.parse(event.data);
      } catch {
        continue; // ignore a malformed event rather than abandoning the answer
      }
      if (event.name === 'meta' && data.conversationId) handlers.onMeta(data.conversationId);
      else if (event.name === 'delta' && data.text) handlers.onDelta(data.text);
      else if (event.name === 'replace' && data.text !== undefined) handlers.onReplace(data.text);
      else if (event.name === 'error') handlers.onError(data.message ?? 'Something went wrong.');
    }
  }
}

export interface ChatSummary {
  id: string;
  title: string;
  turns: number;
  updatedAt: string;
}

export interface SavedChat {
  id: string;
  title: string;
  /** True when the chat has reached its length limit; the customer starts a new one to continue. */
  full: boolean;
  messages: { role: 'user' | 'assistant'; text: string }[];
}

/** A signed-in customer's saved chats. */
export const chatHistoryApi = {
  list: () => authFetch('/api/assistant/conversations').then((r) => parseJson<ChatSummary[]>(r)),
  get: (id: string) => authFetch(`/api/assistant/conversations/${encodeURIComponent(id)}`).then((r) => parseJson<SavedChat>(r)),
  remove: (id: string) => authFetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => parseJson<void>(r)),
};
