import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(8083),
  MONGO_URI: z.string().default('mongodb://localhost:27017/sk_cart'),
  AUTH_JWKS_URL: z.string().url().default('http://localhost:8081/.well-known/jwks.json'),
  AUTH_ISSUER: z.string().default('shopping-karo-auth'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}
