import { ah } from '../lib/errors';
import { actorOf } from '../middleware/auth';
import { body, query } from '../middleware/validate';
import * as svc from '../services/staff-access.service';
import { accessListQuery, accessRequestBody, consentBody, hrReviewBody } from '../validators/access';

export const list = ah(async (req, res) => res.json(await svc.list(actorOf(req), query(req, accessListQuery).status)));
export const create = ah(async (req, res) => res.status(201).json(await svc.createRequest(actorOf(req), body(req, accessRequestBody))));
export const consent = ah(async (req, res) => { const b = body(req, consentBody); res.json(await svc.consent(actorOf(req), String(req.params.id), b.decision === 'approve', b.note)); });
export const review = ah(async (req, res) => { const b = body(req, hrReviewBody); res.json(await svc.hrReview(actorOf(req), String(req.params.id), b.decision === 'approve', b.note, b.durationDays, b.lawfulBasis)); });
export const cancel = ah(async (req, res) => res.json(await svc.cancel(actorOf(req), String(req.params.id))));
export const revoke = ah(async (req, res) => res.json(await svc.revoke(actorOf(req), String(req.params.id))));
export const state = ah(async (req, res) => res.json(await svc.accessState(actorOf(req), String(req.params.employeeId))));
export const auditTrail = ah(async (req, res) => res.json(await svc.accessAudit(actorOf(req))));
