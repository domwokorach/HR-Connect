import { ah } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body } from '../middleware/validate';
import { isAdmin } from '../services/access';
import { audit } from '../services/audit';
import { settings } from '../services/attendance.service';
import { todayIn } from '../lib/dates';
import { benefitBody, enrolBody, enrolPatch } from '../validators/modules';

/** Catalogue is visible to all; enrolments (and their costs) only to HR and the enrolled employee. */
export const list = ah(async (req, res) => {
  const a = actorOf(req);
  const [benefits, enrolments] = await Promise.all([
    prisma.benefit.findMany({ orderBy: { name: 'asc' } }),
    prisma.employeeBenefit.findMany({ where: isAdmin(a) ? {} : { employeeId: a.employeeId ?? '-' }, include: { employee: { select: { fullName: true } } } }),
  ]);
  res.json({ benefits: isAdmin(a) ? benefits : benefits.map(({ monthlyCost, ...b }) => b), enrolments });
});
export const create = ah(async (req, res) => res.status(201).json(await prisma.benefit.create({ data: body(req, benefitBody) })));
export const update = ah(async (req, res) => res.json(await prisma.benefit.update({ where: { id: String(req.params.id) }, data: body(req, benefitBody.partial()) })));

export const enrol = ah(async (req, res) => {
  const d = body(req, enrolBody);
  const b = await prisma.benefit.findUniqueOrThrow({ where: { id: d.benefitId } });
  const e = await prisma.employeeBenefit.create({ data: { employeeId: d.employeeId, benefitId: d.benefitId, monthlyCost: d.monthlyCost ?? b.monthlyCost, startDate: todayIn((await settings()).timezone) } });
  await audit({ actorId: actorOf(req).userId, action: 'BENEFIT_ENROLLED', entity: 'EmployeeBenefit', entityId: e.id, after: e });
  res.status(201).json(e);
});
export const updateEnrolment = ah(async (req, res) => {
  const e = await prisma.employeeBenefit.update({ where: { id: String(req.params.id) }, data: body(req, enrolPatch) });
  await audit({ actorId: actorOf(req).userId, action: 'BENEFIT_ENROLMENT_CHANGED', entity: 'EmployeeBenefit', entityId: e.id, after: { status: e.status } });
  res.json(e);
});
