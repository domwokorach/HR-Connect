import { prisma, type Tx } from '../lib/prisma';

export async function notifyUser(userId: string | null | undefined, title: string, body?: string, kind = 'info', tx: Tx | typeof prisma = prisma) {
  if (!userId) return;
  await tx.notification.create({ data: { userId, title, body, kind } });
}
export async function notifyEmployee(employeeId: string | null | undefined, title: string, body?: string, kind = 'info', tx: Tx | typeof prisma = prisma) {
  if (!employeeId) return;
  const e = await tx.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
  await notifyUser(e?.userId, title, body, kind, tx);
}
export async function notifyAdmins(title: string, body?: string, kind = 'info', tx: Tx | typeof prisma = prisma) {
  const admins = await tx.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
  await tx.notification.createMany({ data: admins.map((a) => ({ userId: a.id, title, body, kind })) });
}
