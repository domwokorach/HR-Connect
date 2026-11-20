import { z } from 'zod';

const scope = z.enum(['CONTACT', 'COMPENSATION', 'DOCUMENTS']);
export const accessRequestBody = z.object({
  subjectId: z.string().uuid(),
  scopes: z.array(scope).min(1).max(3).transform((s) => [...new Set(s)]),
  businessReason: z.string().trim().min(10, 'Give the business reason (at least 10 characters)').max(500),
  purpose: z.string().trim().min(10, 'Explain why you need access (at least 10 characters)').max(500),
  durationDays: z.number().int().min(1).max(30),
});
export const consentBody = z.object({ decision: z.enum(['approve', 'decline']), note: z.string().trim().max(300).optional() });
export const lawfulBasis = z.enum(['consent', 'contract', 'legal_obligation', 'legitimate_interests']);
// Consent (staff) and lawful basis (HR) are recorded separately; HR must name a basis to approve.
export const hrReviewBody = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(300).optional(), durationDays: z.number().int().min(1).max(30).optional(), lawfulBasis: lawfulBasis.optional() })
  .refine((d) => d.decision === 'reject' || !!d.lawfulBasis, { message: 'Record the lawful basis for processing when approving', path: ['lawfulBasis'] });
export const accessListQuery = z.object({ status: z.enum(['PENDING_STAFF', 'PENDING_HR', 'APPROVED', 'DECLINED_BY_STAFF', 'REJECTED_BY_HR', 'CANCELLED', 'REVOKED', 'EXPIRED']).optional() });
