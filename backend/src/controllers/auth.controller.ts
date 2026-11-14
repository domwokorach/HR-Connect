import type { CookieOptions, Request, Response } from 'express';
import { isProd } from '../config';
import { config } from '../config';
import { ah, badRequest, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { body } from '../middleware/validate';
import * as auth from '../services/auth.service';
import { revokeRefresh, rotateRefresh, signAccess } from '../services/tokens';
import { changePasswordBody, forgotBody, loginBody, refreshBody, registerBody, resetBody } from '../validators/auth';

const COOKIE = 'hrc_rt';
const cookieOpts = (persistent = true): CookieOptions => ({ httpOnly: true, secure: isProd, sameSite: 'lax', path: '/api/auth', ...(persistent ? { maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86400_000 } : {}) }); // no maxAge = session cookie

/** Native apps keep the refresh token in SecureStore (sent in the body); browsers get an HttpOnly cookie that JS cannot read. */
const clientType = (req: Request) => {
  const t = req.header('x-client-type');
  if (t !== 'mobile' && t !== 'web') throw badRequest('X-Client-Type header (web|mobile) is required');
  return t;
};

function respond(req: Request, res: Response, out: { accessToken: string; refreshToken: string; user: unknown; persistent?: boolean }) {
  const mobile = clientType(req) === 'mobile';
  if (!mobile) res.cookie(COOKIE, out.refreshToken, cookieOpts(out.persistent ?? true));
  res.json({ accessToken: out.accessToken, expiresIn: config.ACCESS_TOKEN_TTL, user: out.user, ...(mobile ? { refreshToken: out.refreshToken } : {}) });
}

export const login = ah(async (req, res) => {
  clientType(req);
  const { email, password, remember } = body(req, loginBody);
  respond(req, res, await auth.login(email, password, req.header('user-agent'), remember));
});

export const refresh = ah(async (req, res) => {
  const mobile = clientType(req) === 'mobile';
  const presented = mobile ? body(req, refreshBody).refreshToken : (req.cookies?.[COOKIE] as string | undefined);
  if (!presented) throw unauthorized('Session expired');
  const { user, refreshToken, persistent } = await rotateRefresh(presented, req.header('user-agent'));
  const full = await prisma.user.findUnique({ where: { id: user.id }, include: { employee: { select: { id: true, fullName: true } } } });
  respond(req, res, { accessToken: signAccess(user), refreshToken, user: auth.publicUser(full!), persistent });
});

export const logout = ah(async (req, res) => {
  const mobile = clientType(req) === 'mobile';
  await revokeRefresh(mobile ? body(req, refreshBody).refreshToken : (req.cookies?.[COOKIE] as string | undefined));
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
  res.json({ ok: true });
});

export const forgot = ah(async (req, res) => {
  await auth.forgotPassword(body(req, forgotBody).email);
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
});

export const reset = ah(async (req, res) => {
  const { token, password } = body(req, resetBody);
  await auth.resetPassword(token, password);
  res.json({ ok: true });
});

export const me = ah(async (req, res) => {
  const a = actorOf(req);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: a.userId }, include: { employee: { select: { id: true, fullName: true } } } });
  res.json({ user: auth.publicUser(u) });
});

export const changePassword = ah(async (req, res) => {
  const { currentPassword, newPassword } = body(req, changePasswordBody);
  await auth.changePassword(actorOf(req).userId, currentPassword, newPassword);
  res.json({ ok: true, message: 'Password changed. Please sign in again.' });
});

export const register = ah(async (req, res) => {
  res.status(201).json(await auth.registerUser(actorOf(req).userId, body(req, registerBody)));
});
