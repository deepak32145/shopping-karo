import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../http';
import { askAssistant, chatHistoryApi, type ChatSummary } from '../assistant';
import { formatDateTime } from '../lib';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  failed?: boolean;
}

type View = 'chat' | 'history';

const MAX_CHARS = 500;
const GREETING = "Hi, I'm Karo. Ask me how the site works, or tell me what you're shopping for.";
const SUGGESTIONS = ['Gift ideas under ₹1000', 'How does checkout work?', 'How do I track or cancel an order?'];

let nextId = 1;

/**
 * The floating shopping guide. Everything the assistant says is shown as plain text (never as HTML), and only the
 * new message is sent to the server, which keeps the conversation itself. Signed-in customers also get their
 * earlier chats back under History.
 */
export default function AssistantChat({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(false);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const conversationId = useRef<string | null>(null);
  const aborter = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && view === 'chat') field.current?.focus();
  }, [open, view]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, open, view]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => () => aborter.current?.abort(), []);

  // A chat belongs to one account. When someone signs in or out, start clean instead of mixing their chats.
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    reset();
    setChats(null);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchLast = (change: (m: Message) => Message) =>
    setMessages((list) => (list.length ? [...list.slice(0, -1), change(list[list.length - 1])] : list));

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setMessages((list) => [...list, { id: nextId++, role: 'user', text }, { id: nextId++, role: 'assistant', text: '' }]);

    const controller = new AbortController();
    aborter.current = controller;
    try {
      await askAssistant(
        text,
        conversationId.current,
        {
          onMeta: (id) => {
            conversationId.current = id;
            setActiveId(id);
          },
          onDelta: (chunk) => patchLast((m) => ({ ...m, text: m.text + chunk })),
          onReplace: (replacement) => patchLast((m) => ({ ...m, text: replacement })),
          onError: (message) => patchLast((m) => ({ ...m, text: message, failed: true })),
        },
        controller.signal,
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.code === 'CONVERSATION_FULL') setFull(true);
      patchLast((m) => ({ ...m, text: err instanceof Error ? err.message : 'Something went wrong. Please try again.', failed: true }));
    } finally {
      if (aborter.current === controller) {
        setBusy(false);
        field.current?.focus();
      }
    }
  };

  function reset() {
    aborter.current?.abort();
    conversationId.current = null;
    setActiveId(null);
    setMessages([]);
    setFull(false);
    setBusy(false);
    setInput('');
    setView('chat');
  }

  const showHistory = async () => {
    setView('history');
    setHistoryError(null);
    try {
      setChats(await chatHistoryApi.list());
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not load your chats.');
    }
  };

  const openChat = async (id: string) => {
    setHistoryError(null);
    try {
      const saved = await chatHistoryApi.get(id);
      aborter.current?.abort();
      conversationId.current = saved.id;
      setActiveId(saved.id);
      setMessages(saved.messages.map((m) => ({ id: nextId++, role: m.role, text: m.text })));
      setFull(saved.full);
      setBusy(false);
      setView('chat');
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not open that chat.');
    }
  };

  const removeChat = async (chat: ChatSummary) => {
    if (!window.confirm(`Delete "${chat.title}"? This cannot be undone.`)) return;
    try {
      await chatHistoryApi.remove(chat.id);
      setChats((list) => list?.filter((c) => c.id !== chat.id) ?? null);
      if (chat.id === conversationId.current) reset(); // it was the chat on screen
      setView('history');
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not delete that chat.');
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <>
      {!open && (
        <button className="assistant-fab" onClick={() => setOpen(true)} aria-label="Open the shopping assistant">
          <span aria-hidden="true">💬</span> Ask Karo
        </button>
      )}

      {open && (
        <section className="assistant" role="dialog" aria-label="Shopping assistant">
          <header className="assistant-head">
            <div>
              <b>{view === 'history' ? 'Your chats' : 'Karo'}</b>
              <small>{view === 'history' ? 'Saved to your account' : 'Your shopping guide'}</small>
            </div>
            <div className="assistant-head-actions">
              {userId && view === 'chat' && (
                <button className="icon-btn" onClick={() => void showHistory()} aria-label="Chat history" title="Chat history">🕘</button>
              )}
              {view === 'history' && (
                <button className="icon-btn" onClick={() => setView('chat')} aria-label="Back to the chat" title="Back to the chat">←</button>
              )}
              <button className="icon-btn" onClick={reset} aria-label="Start a new chat" title="New chat">＋</button>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close the assistant">✕</button>
            </div>
          </header>

          {view === 'history' ? (
            <div className="assistant-log" aria-live="polite">
              {historyError && <p className="bubble bot failed">{historyError}</p>}
              {chats === null && !historyError && <p className="muted">Loading your chats…</p>}
              {chats?.length === 0 && <p className="muted">No saved chats yet. Ask Karo something and it will show up here.</p>}
              <ul className="chat-list">
                {chats?.map((c) => (
                  <li key={c.id} className={c.id === activeId ? 'active' : ''}>
                    <button className="chat-open" onClick={() => void openChat(c.id)}>
                      <span className="chat-title">{c.title}</span>
                      <small>{formatDateTime(c.updatedAt)} · {c.turns} {c.turns === 1 ? 'question' : 'questions'}</small>
                    </button>
                    <button className="chat-delete" onClick={() => void removeChat(c)} aria-label={`Delete chat ${c.title}`} title="Delete">🗑</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="assistant-log" ref={log} aria-live="polite">
                <p className="bubble bot">{GREETING}</p>
                {messages.length === 0 && (
                  <div className="assistant-chips">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} className="chip" onClick={() => void send(s)} disabled={busy}>{s}</button>
                    ))}
                  </div>
                )}
                {messages.map((m) => (
                  <p key={m.id} className={`bubble ${m.role === 'user' ? 'me' : 'bot'}${m.failed ? ' failed' : ''}`}>
                    {m.text || <span className="typing" role="status" aria-label="Karo is typing"><i /><i /><i /></span>}
                  </p>
                ))}
                {full && <button className="btn btn-dark" onClick={reset}>Start a new chat</button>}
              </div>

              <form className="assistant-form" onSubmit={submit}>
                <input
                  ref={field}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={MAX_CHARS}
                  placeholder="Ask about products or the site"
                  aria-label="Your message"
                  disabled={full}
                  autoComplete="off"
                />
                <button className="btn btn-primary" type="submit" disabled={busy || full || !input.trim()}>Send</button>
              </form>
            </>
          )}
          <p className="assistant-note">
            {userId ? 'Your chats are saved to your account; delete any from History.' : 'Sign in to save your chats.'} Karo only answers questions
            about Shopping Karo. Never share passwords, codes or card details.
          </p>
        </section>
      )}
    </>
  );
}
