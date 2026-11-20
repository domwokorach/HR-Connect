import { Router } from 'express';
import * as c from '../controllers/access-requests.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const accessRequestRoutes = Router();
accessRequestRoutes.use(authenticate);
accessRequestRoutes.get('/', c.list); // admin: all · manager: raised by me · staff: about me
accessRequestRoutes.get('/audit', c.auditTrail); // admin: all · manager: own activity · staff: about me
accessRequestRoutes.get('/state/:employeeId', requireRole('MANAGER'), c.state);
accessRequestRoutes.post('/', requireRole('MANAGER'), c.create);
accessRequestRoutes.patch('/:id/consent', c.consent); // only the staff member concerned (enforced in service)
accessRequestRoutes.patch('/:id/review', requireRole('ADMIN'), c.review);
accessRequestRoutes.patch('/:id/cancel', c.cancel);
accessRequestRoutes.patch('/:id/revoke', c.revoke);
