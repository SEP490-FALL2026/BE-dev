import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { REVOCATION_SOURCES } from '../public/licensing.types';
import { EVIDENCE_MAX_LENGTH, FAILURE_REASON_MAX_LENGTH } from './provisioning.policy';
import { REVOCATION_NOTE_MAX_LENGTH } from './revocation.policy';

/**
 * Only the shape and a generous bound are checked here, and no field can carry a secret: a grant names the request, the
 * subscription and the account, never a password. Whether the request may be granted, the plan and the subscription fit,
 * the account is the company's and a note of evidence or a reason is given (a missing one is taken as blank) is judged by
 * the policy and the service and answers with its own code.
 */
const businessDate = z.string().refine(isBusinessDate, { message: 'Must be a real date as YYYY-MM-DD.' });

export const grantBodySchema = z.strictObject({
  requestId: z.uuid(),
  subscriptionId: z.uuid().optional(),
  accountIdentifier: z.string().max(254).optional(),
  expectedEndDate: businessDate.optional(),
  /** Only for the request of a service account: the person of its department who answers for it, in the place of the one it names. */
  responsibleEmployeeId: z.uuid().optional(),
  /** Only for a request for a group, which is granted one person at a time: the person of the request this grant is for. */
  beneficiaryEmployeeId: z.uuid().optional(),
});
export const completeBodySchema = z.strictObject({ evidence: z.string().max(EVIDENCE_MAX_LENGTH).default('') });
export const failureBodySchema = z.strictObject({ reason: z.string().max(FAILURE_REASON_MAX_LENGTH).default('') });
/** A hand-off carries nothing: it changes only the channel, and the evidence is asked when the manual work completes (F08, `QĐ-90a`). */
export const handOffBodySchema = z.strictObject({});
export const closeFailedBodySchema = failureBodySchema;
/**
 * How a revocation was completed. Which way fits which kind of provisioning, which of the fields it needs (a K1 completion
 * needs the day the paid period ends and what is known of the access) and whether the evidence is enough are judged by the
 * policy and answer with their own codes; a note of evidence is never a password or a key.
 */
export const revocationCompletionBodySchema = z.strictObject({
  completion: z.enum(['ACCOUNT_REMOVED', 'ALREADY_GONE', 'RENEWAL_CANCELLED', 'OFF_SYSTEM_REVOKED']),
  evidence: z.string().max(EVIDENCE_MAX_LENGTH).default(''),
  note: z.string().max(REVOCATION_NOTE_MAX_LENGTH).optional(),
  paidThroughOn: businessDate.optional(),
  accessState: z.enum(['CUT', 'UNTIL_PAID_END']).optional(),
  accessCutOn: businessDate.optional(),
  accessEvidence: z.string().max(EVIDENCE_MAX_LENGTH).optional(),
});
export const accessCutBodySchema = z.strictObject({
  accessCutOn: businessDate,
  evidence: z.string().max(EVIDENCE_MAX_LENGTH).default(''),
});

const TASK_STATUSES = [
  'QUEUED',
  'RETRY_SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CLOSED_FAILED',
  'CANCELLED',
] as const;

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const listTasksQuerySchema = z.strictObject({
  channel: z.enum(['MANUAL', 'CONNECTOR']).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  scope: z.enum(['ALL', 'MINE', 'GENERAL']).default('ALL'),
  ...pageQuery,
});
export const taskIdParamSchema = z.strictObject({ id: z.uuid() });

const stepSchema = z.strictObject({
  code: z.enum([
    'BUY_ON_COMPANY_ACCOUNT',
    'ADD_TO_WORKSPACE',
    'GRANT_IN_INTERNAL_SOFTWARE',
    'OPEN_KEY_STORE',
    'ASSIGN_KEY_WITH_COMPANY_DEVICE',
    'CANCEL_RENEWAL_ON_PROVIDER',
    'RECORD_ACCESS_STATE',
    'REMOVE_FROM_WORKSPACE',
    'REVOKE_IN_INTERNAL_SOFTWARE',
    'CONFIRM_WITH_EVIDENCE',
  ]),
  accountIdentifier: z.string().optional(),
  adminIdentity: z.enum(['ACTING_IT_ADMIN']).optional(),
});
/** What a row of the list says of a revocation: no reasons, notes or evidence (the detail has those). */
const revocationSummarySchema = z.strictObject({
  source: z.enum(REVOCATION_SOURCES),
  reasonCount: z.number().int().nonnegative(),
  completion: z.enum(['ACCOUNT_REMOVED', 'ALREADY_GONE', 'RENEWAL_CANCELLED', 'OFF_SYSTEM_REVOKED']).nullable(),
  accessState: z.enum(['CUT', 'UNTIL_PAID_END']).nullable(),
  paidThroughOn: businessDate.nullable(),
  terminating: z.boolean(),
  terminatingUntil: businessDate.nullable(),
});
const revocationDetailSchema = revocationSummarySchema.extend({
  completionNote: z.string().nullable(),
  accessCutOn: businessDate.nullable(),
  accessEvidence: z.string().nullable(),
  firstReason: z
    .strictObject({
      decidedByEmployeeId: z.uuid().nullable(),
      decidedRole: z.string(),
      referenceKind: z.string().nullable(),
      referenceId: z.uuid().nullable(),
      note: z.string().nullable(),
      decidedAt: z.iso.datetime(),
    })
    .nullable(),
});
/** A row of the list (`LD-08`): the task without its steps, evidence and errors; the detail is this and those. */
const taskSummarySchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['GRANT', 'REVOKE']),
  channel: z.enum(['MANUAL', 'CONNECTOR']),
  status: z.enum(TASK_STATUSES),
  requestId: z.uuid().nullable(),
  assignmentId: z.uuid(),
  beneficiary: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }).nullable(),
  plan: z
    .strictObject({
      planId: z.uuid(),
      planName: z.string(),
      applicationId: z.uuid(),
      applicationName: z.string(),
      provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']),
    })
    .nullable(),
  subscriptionId: z.uuid().nullable(),
  accountIdentifier: z.string(),
  defaultResponsibleEmployeeId: z.uuid().nullable(),
  inGeneralQueue: z.boolean(),
  createdAt: z.iso.datetime(),
  claimedBy: z.uuid().nullable(),
  claimedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  failedAt: z.iso.datetime().nullable(),
  failureKind: z.enum(['TRANSIENT', 'PERMANENT', 'AUTHENTICATION', 'QUOTA_EXCEEDED', 'NOT_DONE']).nullable(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextRetryAt: z.iso.datetime().nullable(),
  availableDecisions: z.array(z.enum(['RETRY', 'HAND_OFF', 'CLOSE_FAILED'])),
  closedAt: z.iso.datetime().nullable(),
  revocation: revocationSummarySchema.nullable(),
  elapsedSeconds: z.number().int().nonnegative(),
});
const taskSchema = taskSummarySchema.extend({
  steps: z.array(stepSchema),
  doneWhen: z
    .enum([
      'PURCHASE_CONFIRMED',
      'MEMBER_ACTIVE',
      'KEY_ASSIGNED_WITH_DEVICE',
      'CONFIRMED_WITH_EVIDENCE',
      'RENEWAL_CANCELLED_WITH_ACCESS_STATE',
      'ACCOUNT_REMOVED_OR_NOT_NEEDED',
      'REVOKED_OFF_SYSTEM_WITH_EVIDENCE',
    ])
    .nullable(),
  completedBy: z.uuid().nullable(),
  evidence: z.string().nullable(),
  failedBy: z.uuid().nullable(),
  failureReason: z.string().nullable(),
  lastError: z.string().nullable(),
  handedOffBy: z.uuid().nullable(),
  handedOffAt: z.iso.datetime().nullable(),
  handOffEvidence: z.string().nullable(),
  closedBy: z.uuid().nullable(),
  closeReason: z.string().nullable(),
  revocation: revocationDetailSchema.nullable(),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class GrantBodyDto extends createZodDto(grantBodySchema) {}
export class CompleteBodyDto extends createZodDto(completeBodySchema) {}
export class FailureBodyDto extends createZodDto(failureBodySchema) {}
export class HandOffBodyDto extends createZodDto(handOffBodySchema) {}
export class CloseFailedBodyDto extends createZodDto(closeFailedBodySchema) {}
export class RevocationCompletionBodyDto extends createZodDto(revocationCompletionBodySchema) {}
export class AccessCutBodyDto extends createZodDto(accessCutBodySchema) {}
export class ListTasksQueryDto extends createZodDto(listTasksQuerySchema) {}
export class TaskIdParamDto extends createZodDto(taskIdParamSchema) {}
export class TaskResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ task: taskSchema }))) {}
export class GrantResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({ task: taskSchema, warnings: z.array(z.enum(['DEPARTMENT_WITHOUT_IT_ADMIN'])) }),
  ),
) {}
export class TaskPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(taskSummarySchema), pagination })),
) {}
