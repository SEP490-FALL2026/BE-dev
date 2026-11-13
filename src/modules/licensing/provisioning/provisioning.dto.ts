import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { K1_CHECKLIST_CODES, K1_CHECKLIST_VARIANTS, REVOCATION_SOURCES } from '../public/licensing.types';
import { EVIDENCE_MAX_LENGTH, FAILURE_REASON_MAX_LENGTH } from './provisioning.policy';
import { REVOCATION_NOTE_MAX_LENGTH } from './revocation.policy';
import { WITHDRAWAL_REASON_MAX_LENGTH } from '../license-key/license-key.policy';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';

/**
 * Only the shape and a generous bound are checked here, and no field can carry a secret: a grant names the request, the
 * subscription and the account, never a password. Whether the request may be granted, the plan and the subscription fit,
 * the account is the company's and a note of evidence or a reason is given (a missing one is taken as blank) is judged by
 * the policy and the service and answers with its own code.
 */

/** What the IT Admin says when buying: only why. The kind of purchase (a seat of K2, a key of K4) follows from the plan, never from the client. */
const purchaseBodySchema = z.strictObject({ reason: z.string().trim().min(1).max(500).optional() });

export const grantBodySchema = z.strictObject({
  requestId: z.uuid(),
  subscriptionId: z.uuid().optional(),
  accountIdentifier: z.string().max(254).optional(),
  /** Only for the request of a service account: the person of its department who answers for it, in the place of the one it names. */
  responsibleEmployeeId: z.uuid().optional(),
  /** Only for a request for a group, which is granted one person at a time: the person of the request this grant is for. */
  beneficiaryEmployeeId: z.uuid().optional(),
  /** Record a purchase with the grant when the pool has nothing free; the kind of purchase follows from the plan (`BR-MF1-09b`). */
  purchase: purchaseBodySchema.optional(),
});
export const completeBodySchema = z.strictObject({
  evidence: z.string().max(EVIDENCE_MAX_LENGTH).default(''),
  /** K4 only, and then required: the free key of the store the seat is given (`QĐ-103d`); a purchased key is imported first. */
  licenseKeyId: z.uuid().optional(),
});
export const failureBodySchema = z.strictObject({ reason: z.string().max(FAILURE_REASON_MAX_LENGTH).default('') });
/** A hand-off carries nothing: it changes only the channel, and the evidence is asked when the manual work completes (`QĐ-90a`). */
export const handOffBodySchema = z.strictObject({});
export const closeFailedBodySchema = failureBodySchema;
const COMPLETIONS = [
  'ACCOUNT_REMOVED',
  'ALREADY_GONE',
  'RENEWAL_CANCELLED',
  'OFF_SYSTEM_REVOKED',
  'KEY_DEACTIVATED',
] as const;

/** The most steps a K1 checklist holds (a departure has six). */
const K1_CHECKLIST_MAX_ITEMS = 10;

/**
 * The checklist the IT Admin ticks to complete the revocation of a K1 seat (`QĐ-111az`, P25): which steps the task has depends on its variant,
 * which the server decides and the card tells (`k1Checklist.variant`). A step is judged by the policy and answers with its own code: one that is
 * missing, not ticked or timed badly (`REVOCATION.K1_CHECKLIST_INCOMPLETE`), ticked out of its order (`K1_CHECKLIST_OUT_OF_ORDER`), or one the
 * variant does not have (`COMPLETION_NOT_ALLOWED`). Only the shape is checked here.
 */
const k1ChecklistBodySchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        code: z.enum(K1_CHECKLIST_CODES),
        done: z.boolean(),
        doneAt: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .max(K1_CHECKLIST_MAX_ITEMS),
  evidence: z.string().max(EVIDENCE_MAX_LENGTH).optional(),
});

/**
 * How a revocation was completed. Which way fits which kind of provisioning, which of the fields it needs (a K1 completion
 * needs the day the paid period ends and what is known of the access) and whether the evidence is enough are judged by the
 * policy and answer with their own codes; a note of evidence is never a password or a key.
 */
export const revocationCompletionBodySchema = z.strictObject({
  completion: z.enum(COMPLETIONS),
  evidence: z.string().max(EVIDENCE_MAX_LENGTH).default(''),
  note: z.string().max(REVOCATION_NOTE_MAX_LENGTH).optional(),
  paidThroughOn: businessDate.optional(),
  accessState: z.enum(['CUT', 'UNTIL_PAID_END']).optional(),
  accessCutOn: businessDate.optional(),
  accessEvidence: z.string().max(EVIDENCE_MAX_LENGTH).optional(),
  /** K4 only, required for K4 (422 `REVOCATION.KEY_DISPOSITION_REQUIRED`): the key goes back to the store, or is withdrawn from it at once (`WITHDRAW`, with a reason). */
  keyDisposition: z.enum(['RETURN_TO_STORE', 'WITHDRAW']).optional(),
  withdrawalReason: z.string().max(WITHDRAWAL_REASON_MAX_LENGTH).optional(),
  /** K1 only, and then required (422 `REVOCATION.K1_CHECKLIST_INCOMPLETE`): the steps done, each with the instant it was done (P25). */
  k1Checklist: k1ChecklistBodySchema.optional(),
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
  /** `true`: only the tasks that may be taken today (a revocation in its grace is left out); `false`: only those in their grace. */
  claimableNow: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /** `true`: only the tasks past their due day that are not over; `false`: all the others (`QĐ-110c`). */
  overdue: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
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
    'DEACTIVATE_KEY_ON_DEVICE',
    'CONFIRM_WITH_EVIDENCE',
  ]),
  accountIdentifier: z.string().optional(),
  adminIdentity: z.enum(['ACTING_IT_ADMIN']).optional(),
});
/** What a row of the list says of a revocation: no reasons, notes or evidence (the detail has those). */
const revocationSummarySchema = z.strictObject({
  source: z.enum(REVOCATION_SOURCES),
  reasonCount: z.number().int().nonnegative(),
  completion: z.enum(COMPLETIONS).nullable(),
  accessState: z.enum(['CUT', 'UNTIL_PAID_END']).nullable(),
  paidThroughOn: responseBusinessDate.nullable(),
  terminating: z.boolean(),
  terminatingUntil: responseBusinessDate.nullable(),
});
/** The checklist on the card of a K1 revocation: the steps of its variant in order, each with the instant it was ticked (null while it is not). */
const k1ChecklistCardSchema = z.strictObject({
  variant: z.enum(K1_CHECKLIST_VARIANTS),
  items: z
    .array(
      z.strictObject({
        code: z.enum(K1_CHECKLIST_CODES),
        label: z.string(),
        order: z.number().int().positive(),
        doneAt: z.iso.datetime().nullable(),
      }),
    )
    .max(K1_CHECKLIST_MAX_ITEMS),
});
const revocationDetailSchema = revocationSummarySchema.extend({
  completionNote: z.string().nullable(),
  accessCutOn: responseBusinessDate.nullable(),
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
  withdrawnReasonCount: z.number().int().nonnegative(),
  lastWithdrawnAt: z.iso.datetime().nullable(),
});
/** A row of the list: the task without its steps, evidence and errors; the detail is this and those. */
const taskSummarySchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['GRANT', 'REVOKE', 'EXTEND']),
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
      /** On the card of a revocation: what the plan says now to do before the seat is taken away, read only; null on a grant and when the plan has none. */
      preRevocationNote: z
        .string()
        .nullable()
        .describe(
          'The note the plan carries now about what to do before the seat is taken away, read when the card is read, not a copy kept when the task was opened. Read only: nobody confirms it. Null on a grant and when the plan has no note.',
        ),
    })
    .nullable(),
  subscriptionId: z.uuid().nullable(),
  accountIdentifier: z.string(),
  defaultResponsibleEmployeeId: z.uuid().nullable(),
  inGeneralQueue: z.boolean(),
  dueOn: responseBusinessDate.nullable(),
  notBefore: responseBusinessDate.nullable(),
  claimableNow: z.boolean(),
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
  /** What was bought with the grant: every K1 grant (`K1_SUBSCRIPTION`), or a K2/K4 pool that had nothing free; null when the seat came from the pool. */
  purchase: z
    .strictObject({
      kind: z.enum(['POOL_TOP_UP', 'KEY_PURCHASE', 'K1_SUBSCRIPTION']),
      reason: z.string().nullable(),
      purchasedAt: z.iso.datetime(),
    })
    .nullable(),
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
  k1Checklist: k1ChecklistCardSchema
    .nullable()
    .describe(
      'Present on a K1 revocation that can still be completed (the steps to tick) and on one completed with a checklist (what was ticked and when). The variant is decided by the server from why the seat is revoked: DEPARTURE (a person who leaves: reset the mailbox password, Forgot password on the software, sign out every session, turn off the renewal, record the evidence, lock the mailbox) or STILL_EMPLOYED (turn off the renewal, record the evidence). The system does not control Google or Microsoft 365: the IT Admin does the steps there and ticks them here, in order. Null on any other task, on a K1 revocation completed before the checklist, and on one cancelled or closed as failed.',
    ),
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
