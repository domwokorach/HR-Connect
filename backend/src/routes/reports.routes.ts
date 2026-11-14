import { Router } from 'express';
import * as c from '../controllers/reports.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const reportRoutes = Router();
reportRoutes.use(authenticate);
reportRoutes.get('/dashboard', c.dashboard);
reportRoutes.get('/attendance', requireRole('ADMIN', 'MANAGER'), c.attendance);
reportRoutes.get('/dataset', requireRole('ADMIN', 'MANAGER'), c.dataset);
reportRoutes.get('/payroll', requireRole('ADMIN'), c.payroll);
