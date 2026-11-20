import { Router } from 'express';
import * as c from '../controllers/workplace.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const workplaceRoutes = Router();
workplaceRoutes.use(authenticate);
workplaceRoutes.get('/networks', requireRole('ADMIN'), c.listNetworks);
workplaceRoutes.post('/networks', requireRole('ADMIN'), c.createNetwork);
workplaceRoutes.patch('/networks/:id', requireRole('ADMIN'), c.updateNetwork);
workplaceRoutes.delete('/networks/:id', requireRole('ADMIN'), c.deleteNetwork);
workplaceRoutes.get('/policy', c.getPolicy);
workplaceRoutes.put('/policy', requireRole('ADMIN'), c.setPolicy);
workplaceRoutes.get('/devices', c.listDevices);
workplaceRoutes.post('/devices', c.registerDevice);
workplaceRoutes.patch('/devices/:id', requireRole('ADMIN'), c.decideDevice);
workplaceRoutes.delete('/devices/:id', c.removeOwnDevice);
workplaceRoutes.patch('/employees/:id/remote', requireRole('ADMIN'), c.setRemote);
workplaceRoutes.get('/audit-logs', requireRole('ADMIN'), c.auditLogs);
