import { prisma, type Tx } from '../lib/prisma';

/** Create the year's balance rows for tracked leave types (idempotent). */
export async function ensureBalances(year: number, employeeId?: string, tx: Tx | typeof prisma = prisma) {
  const [types, emps] = await Promise.all([
    tx.leaveType.findMany({ where: { tracksBalance: true } }),
    employeeId ? [{ id: employeeId }] : tx.employee.findMany({ select: { id: true } }),
  ]);
  if (!types.length || !emps.length) return;
  await tx.leaveBalance.createMany({ data: emps.flatMap((e) => types.map((t) => ({ employeeId: e.id, leaveTypeId: t.id, year, entitled: t.defaultDays }))), skipDuplicates: true });
}
