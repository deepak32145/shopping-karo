import Anthropic from '@anthropic-ai/sdk';

export interface ModelRequest {
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  /** Called with each piece of text as the model writes it. */
  onText: (text: string) => void;
  signal?: AbortSignal;
}

export interface ModelResult {
  content: Anthropic.ContentBlock[];
  stopReason: string | null;
  /** Everything billed for this call: fresh and cached input plus output. */
  tokens: number;
}

/** The one thing the assistant needs from an LLM. Tests replace it with a script. */
export interface ChatModel {
  complete(req: ModelRequest): Promise<ModelResult>;
}

/** A reply is a few sentences. Thinking tokens also count against this, hence the headroom. */
const MAX_TOKENS = 1500;

export class ClaudeChatModel implements ChatModel {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {}

  async complete({ system, tools, messages, onText, signal }: ModelRequest): Promise<ModelResult> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        // Chat answers don't need deep reasoning; low effort keeps the first word fast and the bill small.
        output_config: { effort: 'low' },
        // The system prompt and tools never change, so the prefix is cached; later turns also reuse the chat so far.
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: system }],
        tools,
        messages,
      },
      { signal },
    );
    stream.on('text', onText);
    const message = await stream.finalMessage();
    const u = message.usage;
    return {
      content: message.content,
      stopReason: message.stop_reason,
      tokens: u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    };
  }
}
