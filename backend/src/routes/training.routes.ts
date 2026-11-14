import { Router } from 'express';
import * as c from '../controllers/training.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const trainingRoutes = Router();
trainingRoutes.use(authenticate);
trainingRoutes.get('/', c.list);
trainingRoutes.post('/courses', requireRole('ADMIN', 'MANAGER'), c.createCourse);
trainingRoutes.post('/assign', requireRole('ADMIN', 'MANAGER'), c.assign);
trainingRoutes.patch('/assignments/:id/progress', c.progress);
