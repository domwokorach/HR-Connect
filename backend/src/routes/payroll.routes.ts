import { Router } from 'express';
import * as c from '../controllers/payroll.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const payrollRoutes = Router();
payrollRoutes.use(authenticate);
// self-service (any signed-in employee)
payrollRoutes.get('/payslips/me', c.myPayslips);
payrollRoutes.get('/payslips/:id', c.payslip);
// everything below: HR payroll administrators only
payrollRoutes.use(requireRole('ADMIN'));
payrollRoutes.get('/payslips/employee/:employeeId', c.employeePayslips);
payrollRoutes.get('/', c.list);
payrollRoutes.post('/process', c.process);
payrollRoutes.get('/rules', c.rules);
payrollRoutes.post('/rules', c.createRule);
payrollRoutes.patch('/rules/:id', c.updateRule);
payrollRoutes.delete('/rules/:id', c.deleteRule);
payrollRoutes.patch('/items/:id/bonus', c.bonus);
payrollRoutes.patch('/:id/approve', c.approve);
payrollRoutes.patch('/:id/paid', c.paid);
payrollRoutes.delete('/:id', c.remove);
