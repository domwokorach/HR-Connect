import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOrigins, isProd } from './config';
import { errorHandler, notFoundHandler } from './middleware/error';
import { router } from './routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (isProd) app.set('trust proxy', 1); // behind a TLS-terminating proxy
  app.use(helmet());
  app.use(cors({
    // native apps send no Origin; in development any localhost / 127.0.0.1 port is allowed (Expo Web may pick another port)
    origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin) || (!isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))),
    credentials: true, // lets the browser send the HttpOnly refresh cookie
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
