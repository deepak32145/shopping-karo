import type Anthropic from '@anthropic-ai/sdk';
import type { CatalogSource } from './catalog';
import type { Conversation } from './conversations';
import { OFF_TOPIC_REPLY, OutputGuard } from './guard';
import { TOOLS } from './knowledge';
import type { ChatModel } from './model';
import { runTool } from './tools';

export interface TurnDeps {
  model: ChatModel;
  catalog: CatalogSource;
  system: string;
  canary: string;
}

export interface TurnEvents {
  /** More text for the reply being shown. */
  delta: (text: string) => void;
  /** Throw away what was shown and show this instead. */
  replace: (text: string) => void;
}

export interface TurnResult {
  tokens: number;
  /** The model judged the question to be outside Shopping Karo. */
  offTopic: boolean;
  /** How the turn ended; anything but 'answered' left the conversation history untouched. */
  outcome: 'answered' | 'leak' | 'refused' | 'empty';
}

/** One model call, then its tools, then another, and so on. A runaway loop costs money, so it is capped. */
const MAX_STEPS = 4;

const CANNOT_ANSWER = 'Sorry, I could not put an answer together. Please try asking in a different way.';

class TurnFailed extends Error {}

/**
 * Runs one customer message to a finished answer. The conversation is only ever appended to, and only when the
 * whole turn succeeds: any failure puts it back exactly as it was, so a half-finished tool exchange can never
 * wedge the next message.
 */
export async function runTurn(deps: TurnDeps, conv: Conversation, userText: string, events: TurnEvents, signal?: AbortSignal): Promise<TurnResult> {
  const mark = conv.messages.length;
  let tokens = 0;
  let offTopic = false;
  let shown = 0;
  const guard = new OutputGuard(deps.canary, (text) => {
    shown += text.length;
    events.delta(text);
  });

  const abandon = (outcome: TurnResult['outcome'], reply: string): TurnResult => {
    conv.messages.length = mark;
    events.replace(reply);
    return { tokens, offTopic, outcome };
  };

  try {
    conv.messages.push({ role: 'user', content: userText });

    for (let step = 0; ; step++) {
      if (step >= MAX_STEPS) throw new TurnFailed('tool loop did not finish');
      if (step > 0) guard.breakParagraph();

      const res = await deps.model.complete({ system: deps.system, tools: TOOLS, messages: conv.messages, onText: (t) => guard.push(t), signal });
      tokens += res.tokens;
      if (guard.leaked) return abandon('leak', OFF_TOPIC_REPLY);
      if (res.stopReason === 'refusal') return abandon('refused', OFF_TOPIC_REPLY);

      conv.messages.push({ role: 'assistant', content: res.content });
      const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (res.stopReason !== 'tool_use') {
        if (calls.length > 0) throw new TurnFailed('reply was cut off in the middle of a tool call');
        break;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const out = await runTool(call.name, call.input, deps.catalog);
        if (out.offTopic) offTopic = true;
        results.push({ type: 'tool_result', tool_use_id: call.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
      }
      conv.messages.push({ role: 'user', content: results });
    }

    guard.flush();
    if (guard.leaked) return abandon('leak', OFF_TOPIC_REPLY);
    if (shown === 0) return abandon('empty', CANNOT_ANSWER);
    conv.turns++;
    return { tokens, offTopic, outcome: 'answered' };
  } catch (err) {
    conv.messages.length = mark;
    throw err;
  }
}
