import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { actorOf } from '../middleware/auth';
import { isAdmin, requireEmployee } from '../services/access';
import { signFileToken, verifyFileToken } from '../services/tokens';

// Vercel's filesystem is read-only apart from /tmp (ephemeral), so uploads go there when serverless.
const dir = process.env.VERCEL ? path.join(os.tmpdir(), 'uploads') : path.resolve(config.UPLOAD_DIR);
fs.mkdirSync(dir, { recursive: true });
const ALLOWED: Record<string, string> = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx' };

// Stored under a random name with a server-chosen extension — the client's filename never touches the filesystem.
export const uploader = multer({
  storage: multer.diskStorage({ destination: dir, filename: (_r, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (ALLOWED[f.mimetype] ?? '.bin')) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_r, f, cb) => (ALLOWED[f.mimetype] ? cb(null, true) : cb(badRequest('Only PDF, PNG, JPEG or Word documents are allowed'))),
});

export const upload = ah(async (req, res) => {
  const a = actorOf(req);
  const kind = req.query.kind === 'resume' ? 'resume' : 'leave_document';
  if (!req.file) throw badRequest('No file received');
  try {
    if (kind === 'resume' && !isAdmin(a)) throw forbidden();
    const ownerId = kind === 'leave_document' ? requireEmployee(a) : null;
    const f = await prisma.fileUpload.create({ data: { kind, ownerId, storedName: req.file.filename, originalName: req.file.originalname.slice(0, 200), mimeType: req.file.mimetype, size: req.file.size } });
    res.status(201).json({ id: f.id, name: f.originalName });
  } catch (e) { fs.rmSync(req.file.path, { force: true }); throw e; }
});

export const link = ah(async (req, res) => {
  const a = actorOf(req);
  const f = await prisma.fileUpload.findUnique({ where: { id: String(req.params.id) }, include: { owner: { select: { managerId: true } } } });
  if (!f) throw notFound();
  const allowed = isAdmin(a) || (f.kind === 'leave_document' && (f.ownerId === a.employeeId || (a.role === 'MANAGER' && f.owner?.managerId === a.employeeId)));
  if (!allowed) throw forbidden();
  res.json({ url: `/api/files/${signFileToken(f.id)}` });
});

export const download = ah(async (req, res) => {
  const f = await prisma.fileUpload.findUnique({ where: { id: verifyFileToken(String(req.params.token)) } });
  if (!f) throw notFound();
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(f.mimeType).sendFile(path.join(dir, f.storedName));
});
