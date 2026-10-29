import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { REVOCATION_SOURCES } from '../../licensing/public/licensing.types';
import { ROLE_FLAGS } from '../public/personnel.types';

const businessDate = z.string().refine(isBusinessDate, { message: 'The day must be a real date as YYYY-MM-DD.' });
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * The basis a departure rests on. Every part is optional here and judged after: a basis that is empty or lacks a part has its own
 * answer, and so has a reference that is the code of a notice (`BM-09`), which is not the document that ends the process.
 */
const groundsBodySchema = z.strictObject({
  type: z.string().max(100).nullish(),
  reference: z.string().max(200).nullish(),
  issuer: z.string().max(200).nullish(),
  issuedOn: z.string().max(10).nullish(),
});

const successorBodySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('EMPLOYEE'), employeeId: z.uuid() }),
  z.strictObject({ kind: z.literal('NONE') }),
]);

const accountLockBodySchema = z.strictObject({ note: z.string().trim().min(1).max(1000) });

const recordBodySchema = z.strictObject({
  employeeId: z.uuid(),
  // Judged by the policy, so a day that is missing has its own answer (`LAST_WORKING_DAY_REQUIRED`) in both modes.
  lastWorkingDay: businessDate.optional(),
  abrupt: z.boolean().default(false),
  grounds: groundsBodySchema.optional(),
  successor: successorBodySchema.optional(),
  pendingTransferCancellation: z.strictObject({ reason: z.string().max(1000) }).optional(),
});

const changeLastDayBodySchema = z.strictObject({
  lastWorkingDay: businessDate,
  reason: z.string().max(1000).optional(),
  successor: successorBodySchema.optional(),
});

const cancelBodySchema = z.strictObject({ reason: z.string().max(1000).optional() });

const markLeftBodySchema = z.strictObject({
  departedOn: businessDate.optional(),
  accountLock: accountLockBodySchema.optional(),
});

const revocationsBodySchema = z.strictObject({
  assignmentIds: z.array(z.uuid()).min(1).max(200).optional(),
  count: z.number().int().min(0).max(1000),
  reason: z.string().max(1000).optional(),
  accountLock: accountLockBodySchema.optional(),
});

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};

const listQuerySchema = z.strictObject({
  employeeId: z.uuid().optional(),
  state: z.enum(['HANDING_OVER', 'LEFT', 'CANCELLED']).optional(),
  pastLastDay: flag.optional(),
  accountLockMissing: flag.optional(),
  roleFlag: z.enum(ROLE_FLAGS).optional(),
  ...pageQuery,
});

const pageOnlyQuerySchema = z.strictObject(pageQuery);
const idParamSchema = z.strictObject({ id: z.uuid() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const employeeBrief = z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const stateSchema = z.enum(['HANDING_OVER', 'LEFT', 'CANCELLED']);
const groundsSchema = z.strictObject({
  type: z.string(),
  reference: z.string(),
  issuer: z.string(),
  issuedOn: z.string(),
});
const stepState = z.enum(['PENDING', 'IN_PROGRESS', 'DONE']);

/** The row of the list: who, where the case stands, the days and what still needs a person. */
export const offboardingSummarySchema = z.strictObject({
  id: z.uuid(),
  employee: employeeBrief,
  state: stateSchema,
  abrupt: z.boolean(),
  lastWorkingDay: z.string(),
  handoverDueOn: z.string().nullable(),
  pastLastDay: z.boolean(),
  heldRights: z.number().int().nonnegative(),
  accountLockMissing: z.boolean(),
  closed: z.boolean(),
  /** Every role that needs someone to take over, with whether the person holds it now (all false for a case that was cancelled). */
  roleFlags: z.record(z.enum(ROLE_FLAGS), z.boolean()),
});

/** The four steps of the checklist `BM-08`, in the order they are done. */
const checklistSchema = z.strictObject({
  dataHandover: z.strictObject({ state: stepState, pendingDuties: z.number().int().nonnegative() }),
  accountLock: z.strictObject({ state: stepState, urgent: z.boolean() }),
  revokeAccess: z.strictObject({
    state: stepState,
    heldRights: z.number().int().nonnegative(),
    withoutTask: z.number().int().nonnegative(),
    accessRunsOn: z.number().int().nonnegative(),
  }),
  seatsReleased: z.strictObject({
    state: stepState,
    opened: z.number().int().nonnegative(),
    released: z.number().int().nonnegative(),
  }),
});

const warningsSchema = z.strictObject({
  departmentWithoutHeadFrom: z.string().nullable(),
  businessOwnerApplications: z.number().int().nonnegative(),
  accountLockNotRecorded: z.boolean(),
  /** The workspaces of K2 plans the person owns or administers, by plan id with the application and plan names: they will lose their owner. */
  workspaces: z.record(z.uuid(), z.string()),
  registered: z.record(z.string(), z.number().int().nonnegative()),
});

export const offboardingDetailSchema = offboardingSummarySchema.extend({
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  priorWorkState: z.enum(['WORKING', 'ON_LONG_LEAVE']),
  departureEffectiveOn: z.string(),
  /** The basis of the departure. Null in the minimal projection an IT Admin reads (F12). */
  grounds: groundsSchema.nullable(),
  /** Who follows the head of the department the person leaves; null when they did not head it, and in the minimal projection. */
  headSuccessor: z.strictObject({ kind: z.enum(['EMPLOYEE', 'NONE']), employee: employeeBrief.nullable() }).nullable(),
  /** The account that recorded it; null when the controlled procedure did (`recordedByProcedure`, spec L.2). */
  recordedByAppUserId: z.uuid().nullable(),
  /** True when the departure was recorded by the controlled procedure `pnpm ops:record-super-admin-event` and not by an account. */
  recordedByProcedure: z.boolean(),
  recordedAt: z.iso.datetime(),
  left: z
    .strictObject({
      leftOn: z.string(),
      leftAt: z.iso.datetime(),
      /** The account that marked the person left; null when the controlled procedure recorded the sudden departure. */
      leftByAppUserId: z.uuid().nullable(),
      leftByProcedure: z.boolean(),
    })
    .nullable(),
  /** How the handover was cancelled; null while it was not, and in the minimal projection. */
  cancellation: z
    .strictObject({
      cancelledAt: z.iso.datetime(),
      cancelledByAppUserId: z.uuid().nullable(),
      cancelledByProcedure: z.boolean(),
      reason: z.string(),
    })
    .nullable(),
  accountLock: z
    .strictObject({ recordedAt: z.iso.datetime(), recordedByAppUserId: z.uuid(), note: z.string() })
    .nullable(),
  closure: z.strictObject({ closedAt: z.iso.datetime(), closedByAppUserId: z.uuid() }).nullable(),
  checklist: checklistSchema.nullable(),
  /** What keeps the case open, by code with how many (a finite set of codes); empty when it may be closed. */
  blockers: z.record(z.string(), z.number().int().nonnegative()),
  warnings: warningsSchema,
});

export const offboardingRevocationsOpenedSchema = offboardingDetailSchema.extend({
  revocations: z.strictObject({ created: z.number().int().nonnegative(), reasonAdded: z.number().int().nonnegative() }),
});

const rightSchema = z.strictObject({
  assignmentId: z.uuid(),
  application: z.strictObject({ id: z.uuid(), name: z.string() }),
  plan: z.strictObject({ id: z.uuid(), name: z.string() }),
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']),
  /** What to do before the right is taken away, from the plan. */
  revocationNote: z.string().nullable(),
  dataLossOnRemoval: z.boolean(),
  grantReason: z.string().nullable(),
  effectiveFrom: z.string(),
  validUntil: z.string().nullable(),
  /** A task can take it away: false for the kinds of provisioning that have no revocation yet (K3, K4). */
  revocable: z.boolean(),
  revocation: z
    .strictObject({
      taskId: z.uuid(),
      status: z.enum(['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CLOSED_FAILED', 'CANCELLED']),
      source: z.enum(REVOCATION_SOURCES),
    })
    .nullable(),
  /** The day the access ends when the renewal is cancelled and the access runs on to the end of the paid period. */
  accessRunsOnUntil: z.string().nullable(),
  handover: z
    .strictObject({
      dutyId: z.uuid(),
      status: z.enum(['OPEN', 'CONFIRMED', 'CANCELLED']),
      role: z.enum(['DEPARTMENT_HEAD', 'REQUESTER', 'IT_ADMIN']),
      confirmer: employeeBrief.nullable(),
      waitingReason: z.enum(['NO_HEAD', 'NO_SUCCESSOR']).nullable(),
      dueOn: z.string(),
      overdue: z.boolean(),
      flaggedUnconfirmed: z.boolean(),
    })
    .nullable(),
});

const changeSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum([
    'RECORDED',
    'LAST_DAY_CHANGED',
    'CANCELLED',
    'MARKED_LEFT',
    'ACCOUNT_LOCK_RECORDED',
    'REVOCATIONS_OPENED',
    'CLOSED',
  ]),
  oldLastWorkingDay: z.string().nullable(),
  newLastWorkingDay: z.string().nullable(),
  reason: z.string().nullable(),
  /** For the revocations opened: how many rights were asked for. */
  count: z.number().int().nonnegative().nullable(),
  /** The account that did it; null when the controlled procedure did (`changedByProcedure`, spec L.2). */
  changedByAppUserId: z.uuid().nullable(),
  changedByProcedure: z.boolean(),
  changedAt: z.iso.datetime(),
});

export type OffboardingSummaryWire = z.infer<typeof offboardingSummarySchema>;
export type OffboardingDetailWire = z.infer<typeof offboardingDetailSchema>;
export type OffboardingRevocationsOpenedWire = z.infer<typeof offboardingRevocationsOpenedSchema>;
export type OffboardingRightWire = z.infer<typeof rightSchema>;
export type OffboardingChangeWire = z.infer<typeof changeSchema>;

export class RecordOffboardingBodyDto extends createZodDto(recordBodySchema) {}
export class ChangeLastDayBodyDto extends createZodDto(changeLastDayBodySchema) {}
export class CancelOffboardingBodyDto extends createZodDto(cancelBodySchema) {}
export class MarkLeftBodyDto extends createZodDto(markLeftBodySchema) {}
export class OpenRevocationsBodyDto extends createZodDto(revocationsBodySchema) {}
export class RecordAccountLockBodyDto extends createZodDto(accountLockBodySchema) {}
export class ListOffboardingQueryDto extends createZodDto(listQuerySchema) {}
export class OffboardingPageQueryDto extends createZodDto(pageOnlyQuerySchema) {}
export class OffboardingIdParamDto extends createZodDto(idParamSchema) {}
export class OffboardingDetailResponseDto extends createZodDto(successEnvelopeSchema(offboardingDetailSchema)) {}
export class OffboardingRevocationsOpenedResponseDto extends createZodDto(
  successEnvelopeSchema(offboardingRevocationsOpenedSchema),
) {}
export class OffboardingPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(offboardingSummarySchema), pagination })),
) {}
export class OffboardingRightPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(rightSchema), pagination })),
) {}
export class OffboardingChangePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(changeSchema), pagination })),
) {}
