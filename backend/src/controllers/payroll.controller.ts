import { ah, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body } from '../middleware/validate';
import { requireEmployee } from '../services/access';
import { audit } from '../services/audit';
import * as svc from '../services/payroll.service';
import { bonusBody, processBody, ruleBody } from '../validators/modules';

export const list = ah(async (_req, res) => res.json(await prisma.payroll.findMany({ orderBy: { periodStart: 'desc' }, include: { items: { include: { employee: { select: { fullName: true, employeeCode: true } } } } } })));
export const process = ah(async (req, res) => res.status(201).json(await svc.processPayroll(actorOf(req).userId, body(req, processBody).month)));
export const approve = ah(async (req, res) => res.json(await svc.approve(actorOf(req).userId, String(req.params.id))));
export const paid = ah(async (req, res) => res.json(await svc.markPaid(actorOf(req).userId, String(req.params.id))));
export const remove = ah(async (req, res) => { await svc.removeDraft(actorOf(req).userId, String(req.params.id)); res.json({ ok: true }); });
export const bonus = ah(async (req, res) => res.json(await svc.setBonus(actorOf(req).userId, String(req.params.id), body(req, bonusBody).bonus)));

/** Employees only ever get their own payslips — the filter is the actor's employee id, never a client-supplied one. */
export const myPayslips = ah(async (req, res) => {
  const id = requireEmployee(actorOf(req));
  res.json(await prisma.payslip.findMany({ where: { employeeId: id }, orderBy: { periodStart: 'desc' } }));
});
/** HR view of one employee's payslip history (used on the employee profile). */
export const employeePayslips = ah(async (req, res) => {
  res.json(await prisma.payslip.findMany({ where: { employeeId: String(req.params.employeeId) }, orderBy: { periodStart: 'desc' } }));
});
export const payslip = ah(async (req, res) => {
  const a = actorOf(req);
  const p = await prisma.payslip.findUnique({ where: { id: String(req.params.id) } });
  if (!p || (a.role !== 'ADMIN' && p.employeeId !== a.employeeId)) throw notFound('Payslip not found'); // 404, not 403: do not reveal existence
  res.json(p);
});

export const rules = ah(async (_req, res) => res.json(await prisma.deductionRule.findMany({ orderBy: { createdAt: 'asc' } })));
export const createRule = ah(async (req, res) => {
  const r = await prisma.deductionRule.create({ data: body(req, ruleBody) });
  await audit({ actorId: actorOf(req).userId, action: 'DEDUCTION_RULE_CREATED', entity: 'DeductionRule', entityId: r.id, after: r });
  res.status(201).json(r);
});
export const updateRule = ah(async (req, res) => {
  const r = await prisma.deductionRule.update({ where: { id: String(req.params.id) }, data: body(req, ruleBody.partial()) });
  await audit({ actorId: actorOf(req).userId, action: 'DEDUCTION_RULE_UPDATED', entity: 'DeductionRule', entityId: r.id, after: r });
  res.json(r);
});
export const deleteRule = ah(async (req, res) => {
  await prisma.deductionRule.delete({ where: { id: String(req.params.id) } });
  await audit({ actorId: actorOf(req).userId, action: 'DEDUCTION_RULE_DELETED', entity: 'DeductionRule', entityId: String(req.params.id) });
  res.json({ ok: true });
});
