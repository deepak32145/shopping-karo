import { useEffect, useRef, useState } from 'react';
import { authFetch } from './auth';
import type { Order } from './data/orders';

export type OrderEventType = 'ORDER_CREATED' | 'ORDER_UPDATED';

export interface StreamHandlers {
  onOrder: (type: OrderEventType, order: Order) => void;
  onConnection?: (connected: boolean) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Turns one blank-line-terminated chunk of a Server-Sent Events stream into an event name and its data. */
function parseChunk(chunk: string): { name: string; data: string } | null {
  let name = 'message';
  const data: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith(':')) continue; // comment, e.g. the keep-alive ping
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return data.length ? { name, data: data.join('\n') } : null;
}

/**
 * Listens to a Server-Sent Events endpoint with the user's token (EventSource cannot send an Authorization header)
 * and reconnects with a growing pause if the connection drops. Returns a function that stops it.
 */
export function openOrderStream(path: string, handlers: StreamHandlers): () => void {
  let stopped = false;
  let controller: AbortController | null = null;

  void (async () => {
    let pause = 1000;
    while (!stopped) {
      controller = new AbortController();
      try {
        const res = await authFetch(path, { headers: { Accept: 'text/event-stream' }, signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`stream refused: ${res.status}`);
        handlers.onConnection?.(true);
        pause = 1000;
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
            if (event && (event.name === 'ORDER_CREATED' || event.name === 'ORDER_UPDATED')) {
              try {
                handlers.onOrder(event.name, JSON.parse(event.data) as Order);
              } catch {
                /* ignore a malformed event rather than dropping the connection */
              }
            }
          }
        }
      } catch {
        if (stopped) return;
      }
      handlers.onConnection?.(false);
      if (stopped) return;
      await sleep(pause);
      pause = Math.min(pause * 2, 15000);
    }
  })();

  return () => {
    stopped = true;
    controller?.abort();
  };
}

/** Subscribes for the lifetime of a component. `enabled` false (e.g. signed out) closes the connection. */
export function useOrderStream(path: string, enabled: boolean, onOrder: StreamHandlers['onOrder']): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onOrder);
  handler.current = onOrder;

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    return openOrderStream(path, { onOrder: (t, o) => handler.current(t, o), onConnection: setConnected });
  }, [path, enabled]);

  return connected;
}
