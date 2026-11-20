import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { ipInRules, verifyWorkplace } from '../src/lib/workplace';
import { app, authed, login, request, resetDb, seedBasic } from './helpers';

let s: Awaited<ReturnType<typeof seedBasic>>;
let T: Record<'admin' | 'manager' | 'staff', string>;
const call = (method: 'get' | 'post' | 'patch' | 'put', k: keyof typeof T, url: string, body?: object, ip?: string) => {
  const r = request(app)[method](url).set(authed(T[k]));
  return (ip ? r.set('X-Forwarded-For', ip) : r).send(body);
};
const DEVICE = 'device-abcdef123456';

beforeEach(async () => {
  await resetDb();
  s = await seedBasic();
  T = { admin: (await login('admin')).token, manager: (await login('manager')).token, staff: (await login('staff')).token };
});

describe('verifyWorkplace (pure)', () => {
  const base = { location: 'office' as const, ip: '203.0.113.9', networkRules: ['203.0.113.0/24'], deviceStatus: 'trusted' as const, remoteApproved: false };
  it('verifies an approved network with a trusted device', () => expect(verifyWorkplace(base).verification).toBe('verified'));
  it('needs review for unknown network, pending/revoked device, or no policy; never rejects', () => {
    expect(verifyWorkplace({ ...base, ip: '198.51.100.1' }).verification).toBe('needs_review');
    expect(verifyWorkplace({ ...base, deviceStatus: 'pending' }).verification).toBe('needs_review');
    expect(verifyWorkplace({ ...base, deviceStatus: 'revoked' }).verification).toBe('needs_review');
    expect(verifyWorkplace({ ...base, networkRules: [] }).verification).toBe('needs_review');
  });
  it('remote work is verified only with an approved arrangement', () => {
    expect(verifyWorkplace({ ...base, location: 'remote' }).verification).toBe('needs_review');
    expect(verifyWorkplace({ ...base, location: 'remote', remoteApproved: true }).verification).toBe('verified');
  });
  it('matches CIDR, single IPs and ignores malformed rules', () => {
    expect(ipInRules('10.0.0.5', ['10.0.0.0/24'])).toBe(true);
    expect(ipInRules('10.0.1.5', ['10.0.0.0/24'])).toBe(false);
    expect(ipInRules('10.0.0.5', ['nonsense', '10.0.0.5'])).toBe(true);
    expect(ipInRules(null, ['10.0.0.0/8'])).toBe(false);
  });
});

describe('workplace verification API', () => {
  it('only HR manages networks, devices and remote arrangements', async () => {
    expect((await call('post', 'staff', '/api/workplace/networks', { name: 'HQ', cidr: '203.0.113.0/24' })).status).toBe(403);
    expect((await call('post', 'admin', '/api/workplace/networks', { name: 'HQ', cidr: 'not-an-ip' })).status).toBe(400);
    expect((await call('post', 'admin', '/api/workplace/networks', { name: 'HQ', cidr: '203.0.113.0/24' })).status).toBe(201);
    expect((await call('patch', 'staff', `/api/workplace/employees/${s.staff.emp.id}/remote`, { approved: true })).status).toBe(403);
    expect((await call('put', 'manager', '/api/workplace/policy', { checkIntervalMinutes: 30 })).status).toBe(403);
    expect((await call('put', 'admin', '/api/workplace/policy', { checkIntervalMinutes: 30 })).body.checkIntervalMinutes).toBe(30);
  });

  it('flags an unrecognised network as Needs Review, then verifies on an approved network with a trusted device; HR can resolve', async () => {
    // no networks configured → needs review (not rejected)
    let r = await call('post', 'staff', '/api/attendance/clock-in', { location: 'office', deviceId: DEVICE });
    expect(r.status).toBe(201);
    expect(r.body.verification).toBe('needs_review');
    await call('post', 'staff', '/api/attendance/clock-out', {});
    await prisma.attendance.deleteMany({});

    await call('post', 'admin', '/api/workplace/networks', { name: 'HQ', cidr: '203.0.113.0/24' });
    const dev = await call('post', 'staff', '/api/workplace/devices', { deviceId: DEVICE, label: 'Work laptop' });
    expect(dev.body.status).toBe('pending'); // registering never self-trusts
    expect((await call('patch', 'staff', `/api/workplace/devices/${dev.body.id}`, { status: 'trusted' })).status).toBe(403);
    await call('patch', 'admin', `/api/workplace/devices/${dev.body.id}`, { status: 'trusted' });

    r = await call('post', 'staff', '/api/attendance/clock-in', { location: 'office', deviceId: DEVICE }, '198.51.100.7');
    expect(r.body.verification).toBe('needs_review');
    await prisma.attendance.deleteMany({});

    r = await call('post', 'staff', '/api/attendance/clock-in', { location: 'office', deviceId: DEVICE }, '203.0.113.7');
    expect(r.body.verification).toBe('verified');
    const ok = await call('post', 'staff', '/api/attendance/check', { deviceId: DEVICE }, '203.0.113.7');
    expect(ok.body.verification).toBe('verified');
    const bad = await call('post', 'staff', '/api/attendance/check', { deviceId: DEVICE }, '198.51.100.7'); // moved networks mid-session
    expect(bad.body.verification).toBe('needs_review');
    expect((await call('patch', 'manager', `/api/attendance/${bad.body.id}/verification`, { decision: 'approve' })).status).toBe(403);
    expect((await call('patch', 'admin', `/api/attendance/${bad.body.id}/verification`, { decision: 'approve' })).body.verification).toBe('hr_approved');
    expect((await call('post', 'staff', '/api/attendance/check', { deviceId: DEVICE }, '198.51.100.7')).body.verification).toBe('hr_approved'); // HR decision stands

    const day = (await call('get', 'staff', '/api/attendance/today')).body;
    expect(day.checkIntervalMinutes).toBe(60);
    expect(day.nextCheckDueAt).toBeTruthy();
    const events = await call('get', 'staff', `/api/attendance/events?date=${day.date}`);
    expect(events.body.map((e: { type: string }) => e.type)).toEqual(['clock_in', 'check', 'check', 'hr_review', 'check']);
  });

  it('remote work verifies only after HR approves the arrangement; breaks are excluded from worked time and logged', async () => {
    expect((await call('post', 'staff', '/api/attendance/clock-in', { location: 'remote' })).body.verification).toBe('needs_review');
    await prisma.attendance.deleteMany({});
    await call('patch', 'admin', `/api/workplace/employees/${s.staff.emp.id}/remote`, { approved: true });
    const r = await call('post', 'staff', '/api/attendance/clock-in', { location: 'remote' });
    expect(r.body.verification).toBe('verified');
    expect((await call('post', 'staff', '/api/attendance/check', {})).status).toBe(200);
    expect((await call('post', 'staff', '/api/attendance/start-break', {})).status).toBe(200);
    expect((await call('post', 'staff', '/api/attendance/check', {})).status).toBe(409); // cannot confirm while on break
    await call('post', 'staff', '/api/attendance/end-break', {});
    await call('post', 'staff', '/api/attendance/clock-out', {});
    const types = (await prisma.attendanceEvent.findMany({ orderBy: { at: 'asc' } })).map((e) => e.type);
    expect(types).toEqual(['clock_in', 'check', 'break_start', 'break_end', 'clock_out']);
  });

  it('a manager can see a report\'s events but an unrelated staff member cannot', async () => {
    await call('post', 'staff', '/api/attendance/clock-in', { location: 'remote' });
    const date = (await call('get', 'staff', '/api/attendance/today')).body.date;
    expect((await call('get', 'manager', `/api/attendance/events?date=${date}&employeeId=${s.staff.emp.id}`)).body.length).toBe(1);
    expect((await call('get', 'manager', `/api/attendance/events?date=${date}&employeeId=${s.admin.emp.id}`)).status).toBe(403);
  });
});
