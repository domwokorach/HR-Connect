import { todayIn } from '../lib/dates';
import { ah } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body, query } from '../middleware/validate';
import { idFilter, visibleEmployeeIds } from '../services/access';
import { settings } from '../services/attendance.service';
import * as svc from '../services/leave.service';
import { ensureBalances } from '../services/leave-balance';
import { leaveBody, leaveListQuery, reviewBody } from '../validators/leave';

export const list = ah(async (req, res) => {
  const a = actorOf(req);
  const q = query(req, leaveListQuery);
  const ids = q.scope === 'me' ? (a.employeeId ? [a.employeeId] : []) : await visibleEmployeeIds(a);
  res.json(await prisma.leaveRequest.findMany({
    where: { employeeId: idFilter(ids), ...(q.status && { status: q.status }) },
    include: { leaveType: true, employee: { select: { fullName: true, departmentId: true } } }, orderBy: { createdAt: 'desc' }, take: 300,
  }));
});

export const balances = ah(async (req, res) => {
  const a = actorOf(req);
  const cfg = await settings();
  const year = Number(todayIn(cfg.timezone).slice(0, 4));
  if (a.employeeId) await ensureBalances(year, a.employeeId);
  const ids = await visibleEmployeeIds(a);
  res.json(await prisma.leaveBalance.findMany({ where: { year, employeeId: idFilter(ids) }, include: { leaveType: true } }));
});

export const create = ah(async (req, res) => res.status(201).json(await svc.requestLeave(actorOf(req), body(req, leaveBody))));
export const approve = ah(async (req, res) => res.json(await svc.reviewLeave(actorOf(req), String(req.params.id), true, body(req, reviewBody).note)));
export const reject = ah(async (req, res) => res.json(await svc.reviewLeave(actorOf(req), String(req.params.id), false, body(req, reviewBody).note)));
export const cancel = ah(async (req, res) => res.json(await svc.cancelLeave(actorOf(req), String(req.params.id), todayIn((await settings()).timezone))));
