import mongoose from 'mongoose';
import { createAuth, remoteKeys } from '@sk/node-common';
import { createApp } from './app';
import { loadConfig } from './config';

async function main() {
  const config = loadConfig();
  await mongoose.connect(config.MONGO_URI);
  console.log(`cart-service connected to MongoDB (${mongoose.connection.name})`);

  const auth = createAuth({ keys: remoteKeys(config.AUTH_JWKS_URL), issuer: config.AUTH_ISSUER });
  const server = createApp(auth).listen(config.PORT, () => console.log(`cart-service listening on http://localhost:${config.PORT}`));

  const shutdown = () => {
    server.close(() => void mongoose.disconnect().then(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('cart-service failed to start:', err);
  process.exit(1);
});
