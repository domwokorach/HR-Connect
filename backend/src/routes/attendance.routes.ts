import { Router } from 'express';
import * as c from '../controllers/attendance.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const attendanceRoutes = Router();
attendanceRoutes.use(authenticate);
attendanceRoutes.post('/clock-in', c.clockIn);
attendanceRoutes.post('/start-break', c.startBreak);
attendanceRoutes.post('/end-break', c.endBreak);
attendanceRoutes.post('/clock-out', c.clockOut);
attendanceRoutes.get('/today', c.today);
attendanceRoutes.get('/me', c.mine);
attendanceRoutes.get('/weekly', c.weekly);
attendanceRoutes.get('/team', requireRole('ADMIN', 'MANAGER'), c.team);
attendanceRoutes.post('/corrections', c.requestCorrection);
attendanceRoutes.get('/corrections', c.corrections);
attendanceRoutes.patch('/corrections/:id/:decision(approve|reject)', requireRole('ADMIN', 'MANAGER'), c.reviewCorrection);
attendanceRoutes.patch('/:id/overtime', requireRole('ADMIN', 'MANAGER'), c.reviewOvertime);
attendanceRoutes.post('/close-day', requireRole('ADMIN'), c.closeDay);
