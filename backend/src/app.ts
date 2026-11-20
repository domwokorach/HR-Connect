import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOrigins, isProd } from './config';
import { errorHandler, notFoundHandler } from './middleware/error';
import { handleWebhook } from './integrations/cybersource/cybersource.service';
import { router } from './routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', isProd ? 1 : 'loopback'); // prod: behind a TLS-terminating proxy; dev/test: only loopback peers may set X-Forwarded-For
  app.use(helmet());
  app.use(cors({
    // native apps send no Origin; in development any localhost / 127.0.0.1 port is allowed (Expo Web may pick another port)
    origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin) || (!isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))),
    credentials: true, // lets the browser send the HttpOnly refresh cookie
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
  }));
  // Webhook needs the exact raw bytes for signature verification, so it is mounted before the JSON parser.
  app.post('/api/webhooks/cybersource', express.raw({ type: '*/*', limit: '256kb' }), async (req, res, next) => {
    try { const r = await handleWebhook(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.header('v-c-signature')); res.status(r.status).json(r.body); } catch (e) { next(e); }
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
