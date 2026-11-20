import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/payments.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const paymentRoutes = Router();
// Cron sweep is authorised by CRON_SECRET inside the handler, so it sits before the user-session guard.
paymentRoutes.get('/cron/reconcile', c.sweep);
paymentRoutes.use(authenticate, requireRole('ADMIN'), rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
paymentRoutes.get('/status', c.status);
paymentRoutes.get('/summary', c.stats);
paymentRoutes.get('/transactions', c.list);
paymentRoutes.post('/transactions/:id/reconcile', c.reconcile);
