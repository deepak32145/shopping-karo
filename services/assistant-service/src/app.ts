import express, { Router, type Express, type RequestHandler, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { HttpError, errorHandler, notFound, notFoundHandler, type Auth } from '@sk/node-common';
import { runTurn } from './assistant';
import type { CatalogSource } from './catalog';
import { ConversationStore, MAX_TURNS, type Conversation } from './conversations';
import { screen } from './guard';
import { toTranscript, type ChatHistory } from './history';
import { buildSystemPrompt, newCanary } from './knowledge';
import { DailyBudget, InFlight, SlidingWindow, Strikes } from './limits';
import type { ChatModel } from './model';

export interface AppDeps {
  auth: Auth;
  /** null when no API key is configured: the endpoint then answers 503. */
  model: ChatModel | null;
  catalog: CatalogSource;
  /** Where signed-in users' chats are saved. null keeps every chat in memory only. */
  history: ChatHistory | null;
  rateAnon: number;
  rateUser: number;
  dailyTokenBudget: number;
  trustProxy: boolean;
}

const RATE_WINDOW_MS = 10 * 60_000;
const TITLE_CHARS = 60;

// The browser sends one new message. Everything else it might include (a history, a "system" field...) is dropped here.
const chatBody = z.object({
  message: z.string().max(2_000),
  conversationId: z.string().max(64).optional(),
});

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.trustProxy);
  app.use(helmet());
  app.use(express.json({ limit: '8kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'UP', assistant: deps.model ? 'READY' : 'NOT_CONFIGURED' });
  });
  app.use(chatRoutes(deps));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function chatRoutes(deps: AppDeps): Router {
  const router = Router();
  const canary = newCanary();
  const system = buildSystemPrompt(canary);
  const conversations = new ConversationStore();
  const rate = new SlidingWindow(RATE_WINDOW_MS);
  const strikes = new Strikes(5, RATE_WINDOW_MS, 10 * 60_000);
  const budget = new DailyBudget(deps.dailyTokenBudget);
  const inFlight = new InFlight();

  /** Signed-in users are identified by account; everyone else (or a bad token) by IP address. */
  const optionalUser: RequestHandler = (req, res, next) => {
    if (!req.header('authorization')) return next();
    void deps.auth.authenticate(req, res, (err?: unknown) => {
      if (err) delete req.user;
      next();
    });
  };

  router.post('/chat', optionalUser, async (req, res) => {
    const body = chatBody.parse(req.body);
    if (!deps.model) throw new HttpError(503, 'ASSISTANT_UNAVAILABLE', 'The assistant is not switched on yet.');
    if (budget.exhausted()) throw new HttpError(503, 'ASSISTANT_RESTING', 'The assistant is resting for today. Please try again tomorrow.');

    const who = req.user ? `u:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`;
    const cooling = strikes.coolingDown(who);
    if (cooling > 0) {
      res.setHeader('Retry-After', String(cooling));
      throw new HttpError(429, 'ASSISTANT_COOLDOWN', 'I can only help with Shopping Karo questions. Please come back in a few minutes.');
    }
    const allowed = rate.hit(who, req.user ? deps.rateUser : deps.rateAnon);
    if (!allowed.ok) {
      res.setHeader('Retry-After', String(allowed.retryAfterSec));
      throw new HttpError(429, 'RATE_LIMITED', 'You are sending messages too fast. Please wait a little and try again.');
    }
    if (!inFlight.tryEnter(who)) throw new HttpError(429, 'ASSISTANT_BUSY', 'Please wait for my answer before sending another message.');

    try {
      // Signed-in users' chats live in the database so they can come back to them; visitors' chats stay in memory.
      const saved = req.user && deps.history ? { history: deps.history, userId: req.user.id } : null;
      const conv: Conversation = saved
        ? ((body.conversationId ? await saved.history.load(saved.userId, body.conversationId) : null) ?? saved.history.create(saved.userId))
        : conversations.open(who, body.conversationId);
      if (conv.turns >= MAX_TURNS) throw new HttpError(409, 'CONVERSATION_FULL', 'This chat has got long. Start a new chat to continue.');

      const screened = screen(body.message);
      const send = openStream(res);
      send('meta', { conversationId: conv.id });

      if (!screened.ok) {
        if (screened.reason === 'blocked') strikes.add(who);
        send('delta', { text: screened.reply });
        send('done', {});
        res.end();
        return;
      }

      const aborter = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) aborter.abort();
      });

      try {
        const result = await runTurn(
          { model: deps.model, catalog: deps.catalog, system, canary },
          conv,
          screened.text,
          { delta: (text) => send('delta', { text }), replace: (text) => send('replace', { text }) },
          aborter.signal,
        );
        budget.add(result.tokens);
        if (saved && result.outcome === 'answered') {
          conv.title ??= screened.text.slice(0, TITLE_CHARS);
          await saved.history.save(saved.userId, conv);
        }
        if (result.offTopic || result.outcome === 'leak') strikes.add(who);
        send('done', {});
      } catch (err) {
        if (!aborter.signal.aborted) {
          console.error('assistant turn failed', err);
          send('error', { message: 'The assistant had a problem. Please try again.' });
        }
      }
      res.end();
    } finally {
      inFlight.leave(who);
    }
  });

  // ---------- saved chats (signed-in users only, and only their own) ----------

  const needHistory = (): ChatHistory => {
    if (!deps.history) throw notFound('Chat history');
    return deps.history;
  };

  router.get('/conversations', deps.auth.authenticate, async (req, res) => {
    res.json(deps.history ? await deps.history.list(req.user!.id) : []);
  });

  router.get('/conversations/:id', deps.auth.authenticate, async (req, res) => {
    const conv = await needHistory().load(req.user!.id, String(req.params.id));
    if (!conv) throw notFound('Chat');
    res.json({ id: conv.id, title: conv.title ?? 'Chat', turns: conv.turns, full: conv.turns >= MAX_TURNS, messages: toTranscript(conv.messages) });
  });

  router.delete('/conversations/:id', deps.auth.authenticate, async (req, res) => {
    if (!(await needHistory().remove(req.user!.id, String(req.params.id)))) throw notFound('Chat');
    res.status(204).end();
  });

  return router;
}

/** Switches the response to Server-Sent Events and returns a function that writes one event. */
function openStream(res: Response): (event: string, data: unknown) => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // tell nginx-style proxies not to hold the stream back
  });
  res.flushHeaders();
  return (event, data) => {
    if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}
