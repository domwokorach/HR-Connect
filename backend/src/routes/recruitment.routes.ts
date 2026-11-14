import { Router } from 'express';
import * as c from '../controllers/recruitment.controller';
import { authenticate, requireRole } from '../middleware/auth';

// Candidate data is personal data: HR only.
export const recruitmentRoutes = Router();
recruitmentRoutes.use(authenticate, requireRole('ADMIN'));
recruitmentRoutes.get('/', c.overview);
recruitmentRoutes.post('/jobs', c.createJob);
recruitmentRoutes.patch('/jobs/:id', c.updateJob);
recruitmentRoutes.post('/applications', c.createApplication);
recruitmentRoutes.patch('/applications/:id', c.updateApplication);
recruitmentRoutes.post('/applications/:id/interviews', c.scheduleInterview);
recruitmentRoutes.post('/applications/:id/hire', c.hire);
recruitmentRoutes.patch('/interviews/:id', c.evaluateInterview);
