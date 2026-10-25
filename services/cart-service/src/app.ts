import express, { type Express } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { errorHandler, notFoundHandler, type Auth } from '@sk/node-common';
import { cartRoutes } from './routes';

export function createApp(auth: Auth): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '50kb' }));

  app.get('/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? 'UP' : 'DOWN' });
  });

  app.use(cartRoutes(auth));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
