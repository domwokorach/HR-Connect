import { Router } from 'express';
import * as c from '../controllers/leave.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const leaveRoutes = Router();
leaveRoutes.use(authenticate);
leaveRoutes.get('/', c.list);
leaveRoutes.get('/balances', c.balances);
leaveRoutes.post('/', c.create);
leaveRoutes.patch('/:id/approve', requireRole('ADMIN', 'MANAGER'), c.approve);
leaveRoutes.patch('/:id/reject', requireRole('ADMIN', 'MANAGER'), c.reject);
leaveRoutes.patch('/:id/cancel', c.cancel);
