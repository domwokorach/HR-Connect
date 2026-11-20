import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { app, authed, login, request, resetDb, seedBasic } from './helpers';

let s: Awaited<ReturnType<typeof seedBasic>>;
let T: Record<'admin' | 'manager' | 'staff' | 'other', string>;
const get = (k: keyof typeof T, url: string) => request(app).get(url).set(authed(T[k]));
const send = (method: 'post' | 'patch', k: keyof typeof T, url: string, body?: object) => request(app)[method](url).set(authed(T[k])).send(body);
const ask = (over: object = {}) => send('post', 'manager', '/api/access-requests', { subjectId: s.staff.emp.id, scopes: ['COMPENSATION'], businessReason: 'Preparing the annual review cycle', purpose: 'Annual pay review preparation', durationDays: 7, ...over });
const staffView = async () => (await get('manager', `/api/employees/${s.staff.emp.id}`)).body;

beforeEach(async () => {
  await resetDb();
  s = await seedBasic();
  T = { admin: (await login('admin')).token, manager: (await login('manager')).token, staff: (await login('staff')).token, other: (await login('other')).token };
});

describe('staff access permission workflow', () => {
  it('blocks access until staff consent AND HR approval, then exposes only the granted scope', async () => {
    expect(await staffView()).not.toHaveProperty('salary');
    const r = await ask();
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PENDING_STAFF');
    const id = r.body.id as string;

    expect((await send('patch', 'admin', `/api/access-requests/${id}/review`, { decision: 'approve', lawfulBasis: 'legitimate_interests' })).status).toBe(409); // staff has not consented
    expect(await staffView()).not.toHaveProperty('salary');

    expect((await send('patch', 'manager', `/api/access-requests/${id}/consent`, { decision: 'approve' })).status).toBe(403); // not the subject
    expect((await send('patch', 'other', `/api/access-requests/${id}/consent`, { decision: 'approve' })).status).toBe(403);
    expect((await send('patch', 'staff', `/api/access-requests/${id}/consent`, { decision: 'approve' })).body.status).toBe('PENDING_HR');
    expect(await staffView()).not.toHaveProperty('salary'); // consent alone is not enough

    expect((await send('patch', 'manager', `/api/access-requests/${id}/review`, { decision: 'approve', lawfulBasis: 'legitimate_interests' })).status).toBe(403);
    const ok = await send('patch', 'admin', `/api/access-requests/${id}/review`, { decision: 'approve', durationDays: 3, lawfulBasis: 'legitimate_interests' });
    expect(ok.body.status).toBe('APPROVED');
    expect(ok.body.durationDays).toBe(3);

    const view = await staffView();
    expect(view.salary).toBe(60000);
    expect(view).not.toHaveProperty('phone'); // CONTACT was not granted
    expect(view.accessGranted).toEqual(['COMPENSATION']);
    expect(await prisma.auditLog.count({ where: { action: 'STAFF_DATA_VIEWED' } })).toBe(1);
    expect((await get('manager', '/api/employees/' + s.other.emp.id)).body).not.toHaveProperty('salary');
  });

  it('staff can decline, and a declined request cannot be approved by HR', async () => {
    const id = (await ask()).body.id;
    expect((await send('patch', 'staff', `/api/access-requests/${id}/consent`, { decision: 'decline', note: 'No' })).body.status).toBe('DECLINED_BY_STAFF');
    expect((await send('patch', 'admin', `/api/access-requests/${id}/review`, { decision: 'approve', lawfulBasis: 'legitimate_interests' })).status).toBe(409);
    expect(await staffView()).not.toHaveProperty('salary');
  });

  it('HR can reject but cannot extend the duration', async () => {
    const id = (await ask()).body.id;
    await send('patch', 'staff', `/api/access-requests/${id}/consent`, { decision: 'approve' });
    expect((await send('patch', 'admin', `/api/access-requests/${id}/review`, { decision: 'approve', durationDays: 20, lawfulBasis: 'consent' })).status).toBe(400);
    expect((await send('patch', 'admin', `/api/access-requests/${id}/review`, { decision: 'reject', note: 'No need' })).body.status).toBe('REJECTED_BY_HR');
    expect(await staffView()).not.toHaveProperty('salary');
  });

  it('only a line manager can request, only for direct reports, one open request at a time', async () => {
    expect((await send('post', 'staff', '/api/access-requests', { subjectId: s.other.emp.id, scopes: ['CONTACT'], businessReason: 'Because I want to', purpose: 'Just curious about them', durationDays: 1 })).status).toBe(403);
    expect((await send('post', 'admin', '/api/access-requests', { subjectId: s.staff.emp.id, scopes: ['CONTACT'], businessReason: 'Because I want to', purpose: 'Just curious about them', durationDays: 1 })).status).toBe(403);
    expect((await ask({ subjectId: s.other.emp.id })).status).toBe(403); // not their report
    expect((await ask({ purpose: 'short' })).status).toBe(400);
    expect((await ask({ durationDays: 90 })).status).toBe(400);
    expect((await ask()).status).toBe(201);
    expect((await ask()).status).toBe(409);
  });

  it('staff or HR can revoke; expiry and reassignment end access', async () => {
    const grant = async () => {
      const id = (await ask({ scopes: ['CONTACT', 'COMPENSATION'] })).body.id;
      await send('patch', 'staff', `/api/access-requests/${id}/consent`, { decision: 'approve' });
      await send('patch', 'admin', `/api/access-requests/${id}/review`, { decision: 'approve', lawfulBasis: 'legitimate_interests' });
      return id as string;
    };
    let id = await grant();
    expect((await staffView()).phone).toBe('phone-staff');
    expect((await send('patch', 'other', `/api/access-requests/${id}/revoke`)).status).toBe(403);
    expect((await send('patch', 'staff', `/api/access-requests/${id}/revoke`)).body.status).toBe('REVOKED');
    expect(await staffView()).not.toHaveProperty('salary');

    id = await grant();
    await prisma.staffAccessRequest.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await staffView()).not.toHaveProperty('salary'); // expired

    await prisma.staffAccessRequest.update({ where: { id }, data: { endsAt: new Date(Date.now() + 1e6) } });
    expect(await staffView()).toHaveProperty('salary');
    await prisma.employee.update({ where: { id: s.staff.emp.id }, data: { managerId: null } });
    expect(await staffView()).not.toHaveProperty('salary'); // no longer their report
  });

  it('lists are scoped by role and the requester can cancel while pending', async () => {
    const id = (await ask()).body.id;
    expect((await get('manager', '/api/access-requests')).body).toHaveLength(1);
    expect((await get('staff', '/api/access-requests')).body).toHaveLength(1);
    expect((await get('admin', '/api/access-requests')).body).toHaveLength(1);
    expect((await get('other', '/api/access-requests')).body).toHaveLength(0);
    expect((await send('patch', 'staff', `/api/access-requests/${id}/cancel`)).status).toBe(403);
    expect((await send('patch', 'manager', `/api/access-requests/${id}/cancel`)).body.status).toBe('CANCELLED');
    expect((await send('patch', 'staff', `/api/access-requests/${id}/consent`, { decision: 'approve' })).status).toBe(409);
  });

  it('returns ACCESS_RESTRICTED with the state from the confidential endpoint, audits denials, and walks the status labels', async () => {
    const conf = () => get('manager', `/api/employees/${s.staff.emp.id}/confidential`);
    let r = await conf();
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('ACCESS_RESTRICTED');
    expect(r.body.details.accessState).toBe('RESTRICTED');
    expect(r.body).not.toHaveProperty('salary');
    expect((await get('manager', `/api/employees/${s.staff.emp.id}/documents`)).status).toBe(403); // documents need a DOCUMENTS grant too
    expect(await prisma.auditLog.count({ where: { action: 'STAFF_DATA_DENIED' } })).toBe(2);

    const id = (await ask({ scopes: ['COMPENSATION', 'DOCUMENTS'] })).body.id;
    expect((await get('manager', `/api/access-requests/state/${s.staff.emp.id}`)).body.state).toBe('AWAITING_STAFF_CONSENT');
    expect((await conf()).body.details.accessState).toBe('AWAITING_STAFF_CONSENT');
    await send('patch', 'staff', `/api/access-requests/${id}/consent`, { decision: 'approve' });
    expect((await conf()).body.details.accessState).toBe('AWAITING_HR_APPROVAL');
    expect((await send('patch', 'admin', `/api/access-requests/${id}/review`, { decision: 'approve' })).status).toBe(400); // lawful basis required
    const ok = await send('patch', 'admin', `/api/access-requests/${id}/review`, { decision: 'approve', lawfulBasis: 'legitimate_interests' });
    expect(ok.body.lawfulBasis).toBe('legitimate_interests');

    r = await conf();
    expect(r.status).toBe(200);
    expect(r.body.salary).toBe(60000);
    expect(r.body).not.toHaveProperty('phone');
    expect((await get('manager', `/api/employees/${s.staff.emp.id}/documents`)).status).toBe(200);

    // the staff member can see who looked, and the manager sees their own trail; an unrelated person sees nothing
    const staffTrail = (await get('staff', '/api/access-requests/audit')).body.map((x: { action: string }) => x.action);
    expect(staffTrail).toEqual(expect.arrayContaining(['ACCESS_REQUESTED', 'ACCESS_CONSENTED', 'ACCESS_APPROVED', 'STAFF_DATA_VIEWED']));
    expect((await get('other', '/api/access-requests/audit')).body).toHaveLength(0);

    await prisma.staffAccessRequest.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect((await conf()).status).toBe(403);
    expect((await conf()).body.details.accessState).toBe('EXPIRED');
    expect((await get('manager', '/api/access-requests?status=EXPIRED')).body).toHaveLength(1);
    expect((await get('manager', '/api/access-requests?status=APPROVED')).body).toHaveLength(0);
  });
});
