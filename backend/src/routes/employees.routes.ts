import { Router } from 'express';
import * as c from '../controllers/employees.controller';
import { authenticate, requireRole } from '../middleware/auth';

export const employeeRoutes = Router();
employeeRoutes.use(authenticate);
employeeRoutes.get('/', c.list);
employeeRoutes.post('/', requireRole('ADMIN'), c.create);
employeeRoutes.get('/:id', c.get);
employeeRoutes.get('/:id/documents', c.documents);
employeeRoutes.get('/:id/confidential', c.confidential);
employeeRoutes.patch('/:id', c.update); // HR: any field · staff: own phone/address only (enforced in controller)
employeeRoutes.delete('/:id', requireRole('ADMIN'), c.deactivate);
