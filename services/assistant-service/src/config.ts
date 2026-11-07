import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(8086),
  /** Without a key the service still starts; the chat endpoint answers 503 until one is set. */
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  /** Any Claude model id. claude-haiku-5-5 is far cheaper and plenty for a shopping guide. */
  ASSISTANT_MODEL: z.string().default('claude-opus-5-5'),
  /** Signed-in users' saved chats. */
  MONGO_URI: z.string().default('mongodb://localhost:27017/sk_assistant'),
  CATALOG_URL: z.string().url().default('http://localhost:8082'),
  AUTH_JWKS_URL: z.string().url().default('http://localhost:8081/.well-known/jwks.json'),
  AUTH_ISSUER: z.string().default('shopping-karo-auth'),
  /** Tokens (input + output) the assistant may spend per UTC day, across all users. A cost circuit breaker. */
  DAILY_TOKEN_BUDGET: z.coerce.number().int().min(0).default(2_000_000),
  /** Messages per 10 minutes. Anonymous visitors are limited by IP address, signed-in users by account. */
  RATE_LIMIT_ANON: z.coerce.number().int().min(1).default(15),
  RATE_LIMIT_USER: z.coerce.number().int().min(1).default(40),
  /** Set to true only behind a load balancer you control, so the client IP is read from X-Forwarded-For. */
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env) {
    try {
      process.loadEnvFile('.env'); // local secrets; real environment variables still win
    } catch {
      /* no .env file: fine */
    }
  }
  // A blank `ANTHROPIC_API_KEY=` line means "not set", not "an empty key".
  const present = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}
