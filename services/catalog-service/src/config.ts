import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(8082),
  MONGO_URI: z.string().default('mongodb://localhost:27017/sk_catalog'),
  AUTH_JWKS_URL: z.string().url().default('http://localhost:8081/.well-known/jwks.json'),
  AUTH_ISSUER: z.string().default('shopping-karo-auth'),
  /** Shared secret for order-service's calls. Leave unset to switch the internal API off. */
  INTERNAL_API_KEY: z.string().min(16).optional(),
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
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}
