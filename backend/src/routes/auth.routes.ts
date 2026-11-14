import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/auth.controller';
import { authenticate, requireRole } from '../middleware/auth';

const limiter = (max: number, windowMin: number) => rateLimit({ windowMs: windowMin * 60_000, limit: process.env.NODE_ENV === 'test' ? 10_000 : max, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down.' } });

export const authRoutes = Router();
authRoutes.post('/login', limiter(20, 15), c.login);
authRoutes.post('/refresh', limiter(60, 15), c.refresh);
authRoutes.post('/logout', c.logout);
authRoutes.post('/forgot-password', limiter(5, 60), c.forgot);
authRoutes.post('/reset-password', limiter(10, 60), c.reset);
authRoutes.get('/me', authenticate, c.me);
authRoutes.post('/change-password', authenticate, c.changePassword);
authRoutes.post('/register', authenticate, requireRole('ADMIN'), c.register);
