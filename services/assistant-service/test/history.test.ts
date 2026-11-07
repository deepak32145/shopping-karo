import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import type Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoHistory, toTranscript } from '../src/history';
import { ScriptedModel, build, chat, issuer, say, setupIssuer, useTool } from './helpers';

let container: StartedMongoDBContainer;
const history = new MongoHistory();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:7').start();
  await mongoose.connect(`${container.getConnectionString()}/sk_assistant_test`, { directConnection: true });
  await setupIssuer();
}, 180_000);

afterAll(async () => {
  await mongoose.disconnect();
  await container?.stop();
});

beforeEach(async () => {
  await mongoose.connection.collection('assistantchats').deleteMany({});
});

const withHistory = (model: ScriptedModel) => build(model, { history });

const get = (app: ReturnType<typeof withHistory>, path: string, token?: string) => {
  const r = request(app).get(path);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};
const del = (app: ReturnType<typeof withHistory>, path: string, token?: string) => {
  const r = request(app).delete(path);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

describe('saved chats', () => {
  it('saves a signed-in chat, titled by the first question, and shows it back as a transcript', async () => {
    const app = withHistory(new ScriptedModel([say('Open the cart and press Checkout.')]));
    const alice = await issuer().sign('alice');
    const sent = await chat(app, { message: 'How do I check out?' }, alice);

    const list = await get(app, '/conversations', alice);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: sent.conversationId, title: 'How do I check out?', turns: 1 });

    const one = await get(app, `/conversations/${sent.conversationId}`, alice);
    expect(one.status).toBe(200);
    expect(one.body.messages).toEqual([
      { role: 'user', text: 'How do I check out?' },
      { role: 'assistant', text: 'Open the cart and press Checkout.' },
    ]);
    expect(one.body.full).toBe(false);
  });

  it('lets the user continue an old chat, even after the service restarted', async () => {
    const first = new ScriptedModel([say('First answer')]);
    const alice = await issuer().sign('alice');
    const started = await chat(withHistory(first), { message: 'one' }, alice);

    const second = new ScriptedModel([say('Second answer')]);
    const restarted = withHistory(second); // a brand-new app: nothing in memory
    await chat(restarted, { message: 'two', conversationId: started.conversationId }, alice);

    expect(second.calls[0].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const list = await get(restarted, '/conversations', alice);
    expect(list.body).toHaveLength(1); // same chat, not a new one
    expect(list.body[0].turns).toBe(2);
  });

  it('lists the most recently used chat first', async () => {
    const model = new ScriptedModel();
    const app = withHistory(model);
    const alice = await issuer().sign('alice');
    const a = await chat(app, { message: 'chat A' }, alice);
    await sleep(15);
    const b = await chat(app, { message: 'chat B' }, alice);
    await sleep(15);
    expect((await get(app, '/conversations', alice)).body.map((c: { title: string }) => c.title)).toEqual(['chat B', 'chat A']);

    await chat(app, { message: 'back to A', conversationId: a.conversationId }, alice);
    expect((await get(app, '/conversations', alice)).body.map((c: { id: string }) => c.id)).toEqual([a.conversationId, b.conversationId]);
  });

  it('shows only what the customer saw: no tool traffic, and a multi-step reply is one bubble', async () => {
    const model = new ScriptedModel([
      (req) => {
        req.onText('Let me look.');
        return {
          content: [
            { type: 'text', text: 'Let me look.', citations: null } as Anthropic.TextBlock,
            { type: 'tool_use', id: 'toolu_x', name: 'search_products', input: { query: 'lamp' } } as Anthropic.ToolUseBlock,
          ],
          stopReason: 'tool_use',
          tokens: 5,
        };
      },
      say('The LED Desk Lamp is ₹799.'),
    ]);
    const app = withHistory(model);
    const alice = await issuer().sign('alice');
    const sent = await chat(app, { message: 'a lamp please' }, alice);
    const one = await get(app, `/conversations/${sent.conversationId}`, alice);
    expect(one.body.messages).toEqual([
      { role: 'user', text: 'a lamp please' },
      { role: 'assistant', text: 'Let me look.\n\nThe LED Desk Lamp is ₹799.' },
    ]);
  });

  it('stores tool calls faithfully, including ones with no arguments, so the chat can carry on', async () => {
    const model = new ScriptedModel([useTool('report_off_topic', {}), say('I can only help with Shopping Karo.'), say('Sure, tell me more.')]);
    const app = withHistory(model);
    const alice = await issuer().sign('alice');
    const first = await chat(app, { message: 'tell me a joke' }, alice);
    await chat(app, { message: 'ok, a lamp then', conversationId: first.conversationId }, alice);

    const sent = model.calls[2].messages; // the request after reloading from the database
    const toolCall = (sent[1].content as Anthropic.ToolUseBlock[])[0];
    expect(toolCall).toMatchObject({ type: 'tool_use', name: 'report_off_topic', input: {} });
    expect(sent[2].role).toBe('user'); // its tool result
  });

  it('keeps one user out of another user\'s chats', async () => {
    const model = new ScriptedModel([say('private reply'), say('hello bob')]);
    const app = withHistory(model);
    const [alice, bob] = [await issuer().sign('alice'), await issuer().sign('bob')];
    const a = await chat(app, { message: 'my secret plan' }, alice);

    expect((await get(app, '/conversations', bob)).body).toEqual([]);
    expect((await get(app, `/conversations/${a.conversationId}`, bob)).status).toBe(404);
    expect((await del(app, `/conversations/${a.conversationId}`, bob)).status).toBe(404);

    const b = await chat(app, { message: 'hi', conversationId: a.conversationId }, bob);
    expect(b.conversationId).not.toBe(a.conversationId);
    expect(model.calls[1].messages).toEqual([{ role: 'user', content: 'hi' }]); // Alice's history never reached Bob's prompt
    expect((await get(app, `/conversations/${a.conversationId}`, alice)).body.messages).toHaveLength(2); // untouched
  });

  it('deletes a chat for good', async () => {
    const app = withHistory(new ScriptedModel());
    const alice = await issuer().sign('alice');
    const sent = await chat(app, { message: 'forget me' }, alice);
    expect((await del(app, `/conversations/${sent.conversationId}`, alice)).status).toBe(204);
    expect((await get(app, `/conversations/${sent.conversationId}`, alice)).status).toBe(404);
    expect((await get(app, '/conversations', alice)).body).toEqual([]);
    expect((await del(app, `/conversations/${sent.conversationId}`, alice)).status).toBe(404);
  });

  it('does not save visitors\' chats, failed turns or refused turns', async () => {
    const model = new ScriptedModel([
      say('anonymous answer'),
      () => {
        throw new Error('boom');
      },
      () => ({ content: [], stopReason: 'refusal', tokens: 1 }),
    ]);
    const app = withHistory(model);
    const alice = await issuer().sign('alice');
    await chat(app, { message: 'as a visitor' }); // no token
    await chat(app, { message: 'this one fails' }, alice);
    await chat(app, { message: 'this one is refused' }, alice);
    expect((await get(app, '/conversations', alice)).body).toEqual([]);
    expect(await mongoose.connection.collection('assistantchats').countDocuments()).toBe(0);
  });

  it('needs a signed-in user to read history', async () => {
    const app = withHistory(new ScriptedModel());
    expect((await get(app, '/conversations')).status).toBe(401);
    expect((await get(app, '/conversations/abc')).status).toBe(401);
    expect((await del(app, '/conversations/abc')).status).toBe(401);
  });

  it('reports a full chat so the page can offer a new one', async () => {
    const app = withHistory(new ScriptedModel());
    const alice = await issuer().sign('alice');
    let id: string | undefined;
    for (let i = 0; i < 12; i++) id = (await chat(app, { message: `q${i}`, conversationId: id }, alice)).conversationId;
    expect((await get(app, `/conversations/${id}`, alice)).body.full).toBe(true);
  });

  it('does not treat an injected query operator as a chat id', async () => {
    const app = withHistory(new ScriptedModel());
    const alice = await issuer().sign('alice');
    await chat(app, { message: 'real chat' }, alice);
    const r = await chat(app, { message: 'x', conversationId: { $ne: '' } }, alice);
    expect(r.status).toBe(400); // rejected as malformed, never reaches the database query
  });
});

describe('toTranscript', () => {
  it('skips tool results and thinking, and joins the pieces of one reply', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'one' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: '{}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'two' }] },
    ] as unknown as Anthropic.MessageParam[];
    expect(toTranscript(messages)).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'one\n\ntwo' },
    ]);
  });
});
