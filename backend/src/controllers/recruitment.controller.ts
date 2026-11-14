import { ah, badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body } from '../middleware/validate';
import { audit } from '../services/audit';
import { ensureBalances } from '../services/leave-balance';
import { applicationBody, applicationPatch, hireBody, interviewBody, interviewEval, jobBody } from '../validators/modules';

export const overview = ah(async (_req, res) => {
  const [jobs, applications] = await Promise.all([
    prisma.jobPosting.findMany({ orderBy: { createdAt: 'desc' }, include: { department: { select: { name: true } }, _count: { select: { applications: true } } } }),
    prisma.jobApplication.findMany({ orderBy: { createdAt: 'desc' }, include: { candidate: true, interviews: { orderBy: { scheduledAt: 'asc' }, include: { interviewer: { select: { fullName: true } } } }, job: { select: { title: true } } } }),
  ]);
  res.json({ jobs, applications });
});

export const createJob = ah(async (req, res) => res.status(201).json(await prisma.jobPosting.create({ data: body(req, jobBody) })));
export const updateJob = ah(async (req, res) => res.json(await prisma.jobPosting.update({ where: { id: String(req.params.id) }, data: body(req, jobBody.partial()) })));

export const createApplication = ah(async (req, res) => {
  const d = body(req, applicationBody);
  const job = await prisma.jobPosting.findUnique({ where: { id: d.jobId } });
  if (!job || job.status !== 'open') throw badRequest('That vacancy is not open');
  const app = await prisma.$transaction(async (tx) => {
    const cand = await tx.candidate.create({ data: { fullName: d.fullName, email: d.email, phone: d.phone, resumeId: d.resumeId } });
    return tx.jobApplication.create({ data: { jobId: d.jobId, candidateId: cand.id }, include: { candidate: true } });
  });
  res.status(201).json(app);
});

export const updateApplication = ah(async (req, res) => {
  const a = actorOf(req);
  const d = body(req, applicationPatch);
  const cur = await prisma.jobApplication.findUnique({ where: { id: String(req.params.id) } });
  if (!cur) throw notFound();
  if (cur.status === 'hired') throw badRequest('Hired applications can no longer be edited');
  const next = await prisma.jobApplication.update({ where: { id: cur.id }, data: d });
  await audit({ actorId: a.userId, action: 'APPLICATION_UPDATED', entity: 'JobApplication', entityId: cur.id, before: { status: cur.status, hiringApproved: cur.hiringApproved }, after: d });
  res.json(next);
});

export const scheduleInterview = ah(async (req, res) => {
  const d = body(req, interviewBody);
  const appId = String(req.params.id);
  const iv = await prisma.$transaction(async (tx) => {
    const i = await tx.interview.create({ data: { ...d, applicationId: appId } });
    await tx.jobApplication.updateMany({ where: { id: appId, status: { in: ['applied', 'screening'] } }, data: { status: 'interview' } });
    return i;
  });
  res.status(201).json(iv);
});
export const evaluateInterview = ah(async (req, res) => res.json(await prisma.interview.update({ where: { id: String(req.params.id) }, data: body(req, interviewEval) })));

/** Converts an approved, offered candidate into an Employee (no login yet — HR registers one afterwards). */
export const hire = ah(async (req, res) => {
  const a = actorOf(req);
  const d = body(req, hireBody);
  const emp = await prisma.$transaction(async (tx) => {
    const app = await tx.jobApplication.findUnique({ where: { id: String(req.params.id) }, include: { candidate: true, job: true } });
    if (!app) throw notFound();
    if (app.hiredEmployeeId) throw badRequest('Candidate has already been converted');
    if (app.status !== 'offered') throw badRequest('Only candidates with an offer can be hired');
    if (!app.hiringApproved) throw badRequest('Hiring must be approved first');
    const rows = await tx.employee.findMany({ select: { employeeCode: true } });
    const max = rows.reduce((m, r) => Math.max(m, Number(r.employeeCode.replace(/\D/g, '')) || 1000), 1000);
    const e = await tx.employee.create({ data: { employeeCode: `EMP-${max + 1}`, fullName: app.candidate.fullName, email: app.candidate.email.toLowerCase(), phone: app.candidate.phone, jobTitle: app.job.title, departmentId: app.job.departmentId, managerId: d.managerId ?? null, employmentType: app.job.employmentType, startDate: d.startDate, salary: app.offerSalary ?? 0 } });
    await tx.jobApplication.update({ where: { id: app.id }, data: { status: 'hired', hiredEmployeeId: e.id } });
    await ensureBalances(Number(d.startDate.slice(0, 4)), e.id, tx);
    await audit({ actorId: a.userId, action: 'CANDIDATE_HIRED', entity: 'JobApplication', entityId: app.id, after: { employeeId: e.id } }, tx);
    return e;
  });
  res.status(201).json({ id: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName });
});
