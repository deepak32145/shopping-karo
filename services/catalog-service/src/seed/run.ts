import mongoose from 'mongoose';
import { loadConfig } from '../config';
import { seedProducts } from './seed';

/** `pnpm --filter catalog-service seed`: loads the sample catalogue into the configured database, once, by hand. */
async function main() {
  const config = loadConfig();
  await mongoose.connect(config.MONGO_URI);
  console.log(`Seeding ${mongoose.connection.name} ...`);
  const { inserted, skipped } = await seedProducts();
  console.log(`Done: ${inserted} products added, ${skipped} already existed (left untouched).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
