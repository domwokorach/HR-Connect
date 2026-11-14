import type { Employee, Prisma } from '@prisma/client';
import type { Actor } from '../middleware/auth';
import { forbidden, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';

export const isAdmin = (a: Actor) => a.role === 'ADMIN';
export const isLead = (a: Actor) => a.role !== 'STAFF';

/** Employee ids whose operational data (attendance, leave, training) the actor may see. null = everyone. */
export async function visibleEmployeeIds(a: Actor): Promise<string[] | null> {
  if (isAdmin(a)) return null;
  if (!a.employeeId) return [];
  if (a.role === 'STAFF') return [a.employeeId];
  const reports = await prisma.employee.findMany({ where: { managerId: a.employeeId }, select: { id: true } });
  return [a.employeeId, ...reports.map((r) => r.id)];
}

export const idFilter = (ids: string[] | null): { in: string[] } | undefined => (ids === null ? undefined : { in: ids });

export async function assertCanViewEmployee(a: Actor, employeeId: string) {
  if (isAdmin(a) || a.employeeId === employeeId) return;
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
  if (!e) throw notFound('Employee not found');
  if (a.role === 'MANAGER' && e.managerId === a.employeeId) return;
  throw forbidden();
}

/** Is `a` allowed to approve something belonging to `employeeId`? Never their own. */
export async function assertCanReview(a: Actor, employeeId: string) {
  if (a.employeeId && a.employeeId === employeeId) throw forbidden('You cannot approve your own request');
  if (isAdmin(a)) return;
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } });
  if (a.role === 'MANAGER' && e && e.managerId === a.employeeId) return;
  throw forbidden();
}

export const requireEmployee = (a: Actor): string => { if (!a.employeeId) throw forbidden('No employee record is linked to this account'); return a.employeeId; };

type EmployeeWithRels = Employee & { department?: { id: string; name: string } | null; user?: { role: string; isActive: boolean } | null };

/** Confidential fields (salary, phone, address) are only ever returned to HR and to the employee themself. */
export function toEmployeeDto(e: EmployeeWithRels, a: Actor) {
  const confidential = isAdmin(a) || a.employeeId === e.id;
  const { phone, homeAddress, salary, currency, userId, user, ...rest } = e;
  return {
    ...rest, hasLogin: !!userId, loginRole: isAdmin(a) ? user?.role ?? null : undefined,
    ...(confidential ? { phone, homeAddress, salary, currency } : {}),
  };
}

export const employeeWhereFor = (ids: string[] | null): Prisma.EmployeeWhereInput => (ids === null ? {} : { id: { in: ids } });
