import { ah } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';

export const list = ah(async (req, res) => {
  const userId = actorOf(req).userId;
  const [items, unread] = await Promise.all([prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }), prisma.notification.count({ where: { userId, isRead: false } })]);
  res.json({ items, unread });
});
export const read = ah(async (req, res) => { await prisma.notification.updateMany({ where: { id: String(req.params.id), userId: actorOf(req).userId }, data: { isRead: true } }); res.json({ ok: true }); });
export const readAll = ah(async (req, res) => { await prisma.notification.updateMany({ where: { userId: actorOf(req).userId, isRead: false }, data: { isRead: true } }); res.json({ ok: true }); });
