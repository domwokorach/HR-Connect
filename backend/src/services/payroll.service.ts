import type { EmploymentType } from '@prisma/client';
import { monthEnd, monthStart, round2 } from '../lib/dates';
import { badRequest, conflict, notFound } from '../lib/errors';
import { prisma, type Tx } from '../lib/prisma';
import { audit } from './audit';
import { employeeContext, settings } from './attendance.service';

const num = (d: unknown) => Number(d);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Deductions come exclusively from HR-configured rules (no hard-coded tax or statutory formulas). */
async function deductionsFor(tx: Tx, country: string, type: EmploymentType, gross: number) {
  const rules = await tx.deductionRule.findMany({ where: { active: true, country, OR: [{ employmentType: null }, { employmentType: type }] } });
  const breakdown = rules.map((r) => ({ name: r.name, amount: round2(r.kind === 'percent_of_gross' ? (gross * num(r.value)) / 100 : num(r.value)) }));
  return { breakdown, total: round2(breakdown.reduce((s, b) => s + b.amount, 0)) };
}

async function recalc(tx: Tx, itemId: string) {
  const it = await tx.payrollItem.findUniqueOrThrow({ where: { id: itemId }, include: { employee: true } });
  const gross = round2(num(it.basicSalary) + num(it.allowances) + num(it.bonuses) + num(it.overtimePay));
  const d = await deductionsFor(tx, it.employee.country, it.employee.employmentType, gross);
  return tx.payrollItem.update({ where: { id: itemId }, data: { grossPay: gross, deductions: d.total, deductionBreakdown: d.breakdown, netPay: round2(gross - d.total) } });
}

export async function processPayroll(actorId: string, month: string) {
  const ps = monthStart(month), pe = monthEnd(month);
  const cfg = await settings();
  return prisma.$transaction(async (tx) => {
    if (await tx.payroll.findUnique({ where: { periodStart: ps } })) throw conflict('A payroll already exists for that month');
    const run = await tx.payroll.create({ data: { periodStart: ps, periodEnd: pe, createdById: actorId } });
    const emps = await tx.employee.findMany({ where: { status: { not: 'inactive' }, startDate: { lte: pe }, salary: { gt: 0 } } });
    for (const e of emps) {
      const { schedule } = await employeeContext(e.id, tx);
      const weeklyHours = ((toMin(schedule.endTime) - toMin(schedule.startTime) - schedule.unpaidBreakMinutes) / 60) * schedule.workDays.length;
      const hourly = num(e.salary) / (52 * Math.max(weeklyHours, 1));
      const ot = await tx.attendance.aggregate({ _sum: { overtimeMinutes: true }, where: { employeeId: e.id, workDate: { gte: ps, lte: pe }, overtimeStatus: 'approved' } });
      const allow = await tx.employeeBenefit.findMany({ where: { employeeId: e.id, status: 'enrolled', benefit: { isAllowance: true } } });
      const item = await tx.payrollItem.create({
        data: { payrollId: run.id, employeeId: e.id, basicSalary: round2(num(e.salary) / 12), allowances: round2(allow.reduce((s, a) => s + num(a.monthlyCost), 0)), overtimePay: round2(((ot._sum.overtimeMinutes ?? 0) / 60) * hourly * cfg.overtimeMultiplier) },
      });
      await recalc(tx, item.id);
    }
    await audit({ actorId, action: 'PAYROLL_PROCESSED', entity: 'Payroll', entityId: run.id, after: { period: ps, employees: emps.length } }, tx);
    return tx.payroll.findUniqueOrThrow({ where: { id: run.id }, include: { items: true } });
  }, { timeout: 60_000 });
}

export async function setBonus(actorId: string, itemId: string, bonus: number) {
  return prisma.$transaction(async (tx) => {
    const it = await tx.payrollItem.findUnique({ where: { id: itemId }, include: { payroll: true } });
    if (!it) throw notFound('Payroll item not found');
    if (it.payroll.status !== 'draft') throw badRequest('Only draft payrolls can be edited');
    await tx.payrollItem.update({ where: { id: itemId }, data: { bonuses: bonus } });
    const after = await recalc(tx, itemId);
    await audit({ actorId, action: 'PAYROLL_BONUS_SET', entity: 'PayrollItem', entityId: itemId, before: { bonus: num(it.bonuses) }, after: { bonus } }, tx);
    return after;
  });
}

export async function approve(actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.payroll.updateMany({ where: { id, status: 'draft' }, data: { status: 'approved', approvedById: actorId, approvedAt: new Date() } });
    if (moved.count === 0) { if (!(await tx.payroll.findUnique({ where: { id } }))) throw notFound('Payroll not found'); throw badRequest('Payroll is not a draft'); }
    const run = await tx.payroll.findUniqueOrThrow({ where: { id }, include: { items: { include: { employee: { select: { userId: true } } } } } });
    // Payslips are immutable snapshots created in the same transaction as the approval.
    for (const i of run.items) {
      await tx.payslip.create({ data: { payrollItemId: i.id, employeeId: i.employeeId, periodStart: run.periodStart, periodEnd: run.periodEnd, basicSalary: i.basicSalary, allowances: i.allowances, bonuses: i.bonuses, overtimePay: i.overtimePay, deductions: i.deductions, deductionBreakdown: i.deductionBreakdown ?? [], grossPay: i.grossPay, netPay: i.netPay } });
      if (i.employee.userId) await tx.notification.create({ data: { userId: i.employee.userId, title: 'Payslip available', body: `Your payslip for ${run.periodStart.slice(0, 7)} is ready`, kind: 'payroll' } });
    }
    await audit({ actorId, action: 'PAYROLL_APPROVED', entity: 'Payroll', entityId: id }, tx);
    return run;
  }, { timeout: 60_000 });
}

export async function markPaid(actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.payroll.updateMany({ where: { id, status: 'approved' }, data: { status: 'paid', paidAt: new Date() } });
    if (moved.count === 0) throw badRequest('Only approved payrolls can be marked paid');
    await tx.payrollItem.updateMany({ where: { payrollId: id }, data: { paymentStatus: 'paid' } });
    await tx.payslip.updateMany({ where: { payrollItem: { payrollId: id } }, data: { paymentStatus: 'paid' } });
    await audit({ actorId, action: 'PAYROLL_PAID', entity: 'Payroll', entityId: id }, tx);
    return tx.payroll.findUniqueOrThrow({ where: { id } });
  });
}

export async function removeDraft(actorId: string, id: string) {
  const r = await prisma.payroll.deleteMany({ where: { id, status: 'draft' } });
  if (r.count === 0) throw badRequest('Only draft payrolls can be deleted');
  await audit({ actorId, action: 'PAYROLL_DELETED', entity: 'Payroll', entityId: id });
}
