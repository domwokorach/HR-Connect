import { Router } from 'express';
import * as c from '../controllers/benefits.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const benefitRoutes = Router();
benefitRoutes.use(authenticate);
benefitRoutes.get('/', c.list);
benefitRoutes.post('/', requireRole('ADMIN'), c.create);
benefitRoutes.patch('/enrolments/:id', requireRole('ADMIN'), c.updateEnrolment);
benefitRoutes.post('/enrolments', requireRole('ADMIN'), c.enrol);
benefitRoutes.patch('/:id', requireRole('ADMIN'), c.update);
