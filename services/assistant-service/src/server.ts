import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';
import { createAuth, remoteKeys } from '@sk/node-common';
import { createApp } from './app';
import { CatalogClient } from './catalog';
import { loadConfig } from './config';
import { MongoHistory } from './history';
import { ClaudeChatModel } from './model';

async function main() {
  const config = loadConfig();
  await mongoose.connect(config.MONGO_URI);
  console.log(`assistant-service connected to MongoDB (${mongoose.connection.name})`);

  const auth = createAuth({ keys: remoteKeys(config.AUTH_JWKS_URL), issuer: config.AUTH_ISSUER });

  const model = config.ANTHROPIC_API_KEY ? new ClaudeChatModel(new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }), config.ASSISTANT_MODEL) : null;
  if (model) console.log(`assistant-service using ${config.ASSISTANT_MODEL}`);
  else console.warn('ANTHROPIC_API_KEY is not set: the assistant answers 503 until it is');

  const app = createApp({
    auth,
    model,
    catalog: new CatalogClient(config.CATALOG_URL),
    history: new MongoHistory(),
    rateAnon: config.RATE_LIMIT_ANON,
    rateUser: config.RATE_LIMIT_USER,
    dailyTokenBudget: config.DAILY_TOKEN_BUDGET,
    trustProxy: config.TRUST_PROXY === 'true',
  });
  const server = app.listen(config.PORT, () => console.log(`assistant-service listening on http://localhost:${config.PORT}`));

  const shutdown = () => server.close(() => void mongoose.disconnect().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('assistant-service failed to start:', err);
  process.exit(1);
});
