import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { app, authed, login, mobile, PASSWORD, request, resetDb, seedBasic, web } from './helpers';

const mail = vi.hoisted(() => ({ last: '' }));
vi.mock('../src/services/mailer', () => ({ sendMail: async (_to: string, _s: string, text: string) => { mail.last = text; } }));

beforeAll(resetDb);
beforeEach(async () => { await resetDb(); await seedBasic(); });

describe('authentication', () => {
  it('logs in and returns a short-lived signed access token (never the role from the client)', async () => {
    const { res } = await login('manager');
    expect(res.status).toBe(200);
    const claims = jwt.decode(res.body.accessToken) as Record<string, unknown>;
    expect(claims).toMatchObject({ role: 'MANAGER', type: 'access' });
    expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(900);
    expect(res.body.user.role).toBe('MANAGER');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it('rejects wrong password and unknown email with the same message', async () => {
    const a = await request(app).post('/api/auth/login').set(mobile).send({ email: 'staff@test.io', password: 'nope-nope-nope' });
    const b = await request(app).post('/api/auth/login').set(mobile).send({ email: 'ghost@test.io', password: 'nope-nope-nope' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  it('requires the X-Client-Type header and validates input', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'staff@test.io', password: PASSWORD })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').set(mobile).send({ email: 'not-an-email', password: 'x' })).status).toBe(400);
  });

  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').set(mobile).send({ email: 'staff@test.io', password: 'wrong-wrong-1' });
    const res = await request(app).post('/api/auth/login').set(mobile).send({ email: 'staff@test.io', password: PASSWORD });
    expect(res.status).toBe(429);
  });

  it('protects routes and rejects tampered / expired / refresh-typed tokens', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set({ Authorization: 'Bearer garbage' })).status).toBe(401);
    const forged = jwt.sign({ sub: 'x', role: 'ADMIN', type: 'access', tv: 0 }, 'a-different-secret-a-different-secret-1234');
    expect((await request(app).get('/api/employees').set({ Authorization: `Bearer ${forged}` })).status).toBe(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'staff@test.io' } });
    const expired = jwt.sign({ sub: user.id, role: 'STAFF', type: 'access', tv: 0 }, process.env.JWT_ACCESS_SECRET!, { expiresIn: -10 });
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${expired}` })).status).toBe(401);
    const wrongType = jwt.sign({ sub: user.id, role: 'STAFF', type: 'refresh', tv: 0 }, process.env.JWT_ACCESS_SECRET!);
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${wrongType}` })).status).toBe(401);
  });

  it('ignores a role claim that disagrees with the database', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'staff@test.io' } });
    const lying = jwt.sign({ sub: user.id, role: 'ADMIN', type: 'access', tv: user.tokenVersion }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '5m' });
    expect((await request(app).get('/api/payroll').set({ Authorization: `Bearer ${lying}` })).status).toBe(403);
  });

  it('rotates refresh tokens; replay of an old one (after the grace window) revokes the whole family', async () => {
    const { refresh } = await login('staff');
    const r1 = await request(app).post('/api/auth/refresh').set(mobile).send({ refreshToken: refresh });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).toBeTruthy(); expect(r1.body.refreshToken).not.toBe(refresh);
    // pretend the rotation happened a minute ago, so a replay is not a "lost response" retry
    await prisma.refreshToken.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    const replay = await request(app).post('/api/auth/refresh').set(mobile).send({ refreshToken: refresh });
    expect(replay.status).toBe(401);
    const afterTheft = await request(app).post('/api/auth/refresh').set(mobile).send({ refreshToken: r1.body.refreshToken });
    expect(afterTheft.status).toBe(401); // the legitimate descendant is revoked too
  });

  it('tolerates a retry of a just-rotated token (lost response) without logging the user out', async () => {
    const { refresh } = await login('staff');
    const first = await request(app).post('/api/auth/refresh').set(mobile).send({ refreshToken: refresh });
    expect(first.status).toBe(200);
    const retry = await request(app).post('/api/auth/refresh').set(mobile).send({ refreshToken: refresh }); // same token again, immediately
    expect(retry.status).toBe(200);
    expect(retry.body.refreshToken).toBeTruthy();
    expect((await request(app).post('/api/auth/refresh').set(mobile).send({ refreshToken: retry.body.refreshToken })).status).toBe(200);
  });

  it('stores only a hash of refresh tokens', async () => {
    const { refresh } = await login('staff');
    const rows = await prisma.refreshToken.findMany();
    expect(rows.length).toBe(1);
    expect(rows[0].tokenHash).not.toBe(refresh);
    expect(JSON.stringify(rows)).not.toContain(refresh!);
  });

  it('web clients get an HttpOnly cookie and no refresh token in the body', async () => {
    const res = await request(app).post('/api/auth/login').set(web).send({ email: 'staff@test.io', password: PASSWORD });
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/hrc_rt=/); expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/SameSite=Lax/i);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').set(web).send({ email: 'staff@test.io', password: PASSWORD });
    expect((await agent.post('/api/auth/refresh').set(web)).status).toBe(200);
  });

  it('"remember me" off: session cookie and a 1-day refresh token that stays non-persistent after rotation', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').set(web).send({ email: 'staff@test.io', password: PASSWORD, remember: false });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
    const row = await prisma.refreshToken.findFirstOrThrow();
    expect(row.persistent).toBe(false);
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(86400_000);
    const r2 = await agent.post('/api/auth/refresh').set(web);
    expect(r2.status).toBe(200);
    expect((r2.headers['set-cookie'] as unknown as string[])[0]).not.toMatch(/Max-Age|Expires/i);
    expect(await prisma.refreshToken.count({ where: { persistent: false } })).toBe(2);
  });

  it('logout revokes the refresh token', async () => {
    const { refresh } = await login('staff');
    expect((await request(app).post('/api/auth/logout').set(mobile).send({ refreshToken: refresh })).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set(mobile).send({ refreshToken: refresh })).status).toBe(401);
  });

  it('password reset: generic response, single-use token, old sessions revoked', async () => {
    const { token, refresh } = await login('staff');
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@test.io' });
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'staff@test.io' });
    expect(unknown.body).toEqual(known.body);
    const resetToken = /token=([\w-]+)/.exec(mail.last)![1];
    expect((await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'weak' })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'Brand-New-Pass-9' })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token: resetToken, password: 'Another-Pass-99' })).status).toBe(400); // single use
    expect((await request(app).get('/api/auth/me').set(authed(token))).status).toBe(401); // old access token invalidated
    expect((await request(app).post('/api/auth/refresh').set(mobile).send({ refreshToken: refresh })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').set(mobile).send({ email: 'staff@test.io', password: 'Brand-New-Pass-9' })).status).toBe(200);
  });

  it('deactivating a user invalidates their tokens immediately', async () => {
    const { token: adminToken } = await login('admin');
    const { token } = await login('staff');
    const emp = await prisma.employee.findUniqueOrThrow({ where: { email: 'staff@test.io' } });
    expect((await request(app).delete(`/api/employees/${emp.id}`).set(authed(adminToken))).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(authed(token))).status).toBe(401);
    expect((await login('staff')).res.status).toBe(401);
  });

  it('only admins can register logins', async () => {
    const { token } = await login('manager');
    const e = await prisma.employee.create({ data: { employeeCode: 'EMP-9', fullName: 'New', email: 'new@test.io', startDate: '2024-01-01' } });
    expect((await request(app).post('/api/auth/register').set(authed(token)).send({ employeeId: e.id, password: PASSWORD })).status).toBe(403);
    const { token: at } = await login('admin');
    expect((await request(app).post('/api/auth/register').set(authed(at)).send({ employeeId: e.id, password: PASSWORD, role: 'STAFF' })).status).toBe(201);
  });
});
