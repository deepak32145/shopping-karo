import mongoose from 'mongoose';
import { createAuth, remoteKeys } from '@sk/node-common';
import { createApp } from './app';
import { loadConfig } from './config';

async function main() {
  const config = loadConfig();
  await mongoose.connect(config.MONGO_URI);
  console.log(`catalog-service connected to MongoDB (${mongoose.connection.name})`);

  const auth = createAuth({ keys: remoteKeys(config.AUTH_JWKS_URL), issuer: config.AUTH_ISSUER });
  if (!config.INTERNAL_API_KEY) console.warn('INTERNAL_API_KEY is not set: stock reservation for checkout is disabled');
  const server = createApp(auth, { internalKey: config.INTERNAL_API_KEY }).listen(config.PORT, () =>
    console.log(`catalog-service listening on http://localhost:${config.PORT}`),
  );

  const shutdown = () => {
    server.close(() => void mongoose.disconnect().then(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('catalog-service failed to start:', err);
  process.exit(1);
});
