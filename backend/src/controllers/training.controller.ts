import { todayIn } from '../lib/dates';
import { ah, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body } from '../middleware/validate';
import { assertCanReview, idFilter, isAdmin, visibleEmployeeIds } from '../services/access';
import { settings } from '../services/attendance.service';
import { notifyEmployee } from '../services/notify';
import { assignBody, courseBody, progressBody } from '../validators/modules';
import crypto from 'node:crypto';

export const list = ah(async (req, res) => {
  const a = actorOf(req);
  const t = todayIn((await settings()).timezone);
  await prisma.employeeTraining.updateMany({ where: { status: { in: ['not_started', 'in_progress'] }, dueDate: { lt: t } }, data: { status: 'overdue' } });
  const ids = await visibleEmployeeIds(a);
  const [courses, assignments] = await Promise.all([
    prisma.training.findMany({ orderBy: { title: 'asc' } }),
    prisma.employeeTraining.findMany({ where: { employeeId: idFilter(ids) }, include: { employee: { select: { fullName: true, departmentId: true, department: { select: { name: true } } } }, training: { select: { title: true, code: true } } }, orderBy: { dueDate: 'asc' } }),
  ]);
  res.json({ courses, assignments });
});

export const createCourse = ah(async (req, res) => {
  const d = body(req, courseBody);
  res.status(201).json(await prisma.training.create({ data: { ...d, code: `TRN-${crypto.randomBytes(3).toString('hex').toUpperCase()}` } }));
});

export const assign = ah(async (req, res) => {
  const a = actorOf(req);
  const d = body(req, assignBody);
  if (!isAdmin(a)) { // managers may only assign to their own reports
    const e = await prisma.employee.findUnique({ where: { id: d.employeeId }, select: { managerId: true } });
    if (!e || e.managerId !== a.employeeId) throw forbidden('You can only assign training to your team members');
  }
  const course = await prisma.training.findUnique({ where: { id: d.trainingId } });
  if (!course) throw notFound('Course not found');
  const today = todayIn((await settings()).timezone);
  try {
    const row = await prisma.employeeTraining.create({ data: { trainingId: d.trainingId, employeeId: d.employeeId, dueDate: d.dueDate, assignedDate: today, assignedById: a.employeeId } });
    await notifyEmployee(d.employeeId, 'New training assigned', `${course.title} — due ${d.dueDate}`, 'training');
    res.status(201).json(row);
  } catch (e) { if ((e as { code?: string }).code === 'P2002') throw conflict('That employee already has this course'); throw e; }
});

export const progress = ah(async (req, res) => {
  const a = actorOf(req);
  const { progress } = body(req, progressBody);
  const t = await prisma.employeeTraining.findUnique({ where: { id: String(req.params.id) } });
  if (!t || t.employeeId !== a.employeeId) throw notFound('Assignment not found'); // only the assignee may update progress
  const today = todayIn((await settings()).timezone);
  if (t.status === 'completed' && progress < 100) throw badRequest('Completed training cannot be reopened');
  res.json(await prisma.employeeTraining.update({ where: { id: t.id }, data: { progress, status: progress === 100 ? 'completed' : progress > 0 ? (t.dueDate < today ? 'overdue' : 'in_progress') : 'not_started', completionDate: progress === 100 ? today : null } }));
});

