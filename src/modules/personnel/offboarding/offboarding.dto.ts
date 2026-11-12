import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { REVOCATION_SOURCES } from '../../licensing/public/licensing.types';
import { ROLE_FLAGS } from '../public/personnel.types';
import { businessDay } from '../../../infrastructure/http/dto/business-date.dto';
import { groundsNoteBodySchema } from '../personnel-grounds.dto';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const successorBodySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('EMPLOYEE'), employeeId: z.uuid() }),
  z.strictObject({ kind: z.literal('NONE') }),
]);

const accountLockBodySchema = z.strictObject({ note: z.string().trim().min(1).max(1000) });

const recordBodySchema = z.strictObject({
  employeeId: z.uuid(),
  // The mode is always given: the Super Admin chooses it on purpose, there is no default (`QĐ-96c`). The last working day is required
  // for a planned handover; a departure blocked now works to the end of the day it is recorded, so it is left out or is today (`QĐ-110b`).
  lastWorkingDay: businessDay.optional(),
  accessBlockMode: z.enum(['WITH_LAST_DAY', 'BLOCK_NOW']),
  groundsNote: groundsNoteBodySchema,
  successor: successorBodySchema.optional(),
  // A transfer that waits and would take effect after the last working day is cancelled with the departure: the Super Admin confirms it,
  // the reason is the standard one and the basis is the one of the departure.
  cancelPendingTransfer: z.literal(true).optional(),
});

const reasonSchema = z.string().trim().min(1).max(1000);

const changeLastDayBodySchema = z.strictObject({
  lastWorkingDay: businessDay,
  reason: reasonSchema,
  groundsNote: groundsNoteBodySchema,
  successor: successorBodySchema.optional(),
});

const cancelBodySchema = z.strictObject({ reason: reasonSchema, groundsNote: groundsNoteBodySchema });

/** The person left on their last working day: nothing is typed, and the lock of the company account is the IT Admin's step. */
const markLeftBodySchema = z.strictObject({});

/** The rights are the server's to count, and the reason is the standard one of a departure: the IT Admin may add a note. */
const revocationsBodySchema = z.strictObject({
  assignmentIds: z.array(z.uuid()).min(1).max(200).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
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
  /** `true`: the departures past the deadline of their revocations with a right still without a completed task; `false`: the others (`QĐ-110c`). */
  revocationOverdue: flag.optional(),
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
const stepState = z.enum(['PENDING', 'IN_PROGRESS', 'DONE']);

/** The row of the list: who, where the case stands, the days and what still needs a person. */
export const offboardingSummarySchema = z.strictObject({
  id: z.uuid(),
  employee: employeeBrief,
  state: stateSchema,
  accessBlockMode: z.enum(['WITH_LAST_DAY', 'BLOCK_NOW']),
  lastWorkingDay: z.string(),
  /** Always null since `QĐ-110g` (no deadline of a handover is told): the key stays until the clients stop reading it, then goes. */
  handoverDueOn: z.string().nullable(),
  pastLastDay: z.boolean(),
  /** The departure refuses the person today (the last working day has passed, or they have left): the IT Admin may lock the account and open the revocations. */
  accessBlocked: z.boolean(),
  /** The first day the departure refuses the person; null for a cancelled case. */
  accessBlockedFrom: z.string().nullable(),
  heldRights: z.number().int().nonnegative(),
  /**
   * The deadline of the revocations is on the case (`QĐ-110c`, `M-09`): `dueOn` is the working day after the last working day (null for a case
   * closed or cancelled before the rule), `rightsWithoutCompletedTask` the personal seats of the person that have no task of revocation completed
   * (those nobody opened a task for included; 0 for a cancelled case) and `overdue` whether today is past `dueOn` with such a seat left.
   */
  revocation: z.strictObject({
    dueOn: z.string().nullable(),
    overdue: z.boolean(),
    rightsWithoutCompletedTask: z.number().int().nonnegative(),
  }),
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
  accountLockNotRecorded: z.boolean(),
  /** The workspaces of K2 plans the person owns or administers, by plan id with the application and plan names: they will lose their owner. */
  workspaces: z.record(z.uuid(), z.string()),
  registered: z.record(z.string(), z.number().int().nonnegative()),
});

export const offboardingDetailSchema = offboardingSummarySchema.extend({
  /** Null for a person who had no placement in force when the departure was recorded (unplaced, `QĐ-93g`(5)). */
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  /** Only on the answer to the cancellation of a case that had cancelled a first placement: whether it was put back. */
  firstPlacementRestored: z.boolean().optional(),
  /**
   * Only on the answer to the cancellation: what taking back the reasons of the departure did to the tasks of revocation (`QĐ-110c`).
   * All zero when the last working day had not passed, when nothing was opened, or when no task carried a reason of this departure; a task already
   * completed is told apart in `alreadyDone` so the four numbers add up to the tasks the seats of the person had.
   */
  revocationsWithdrawn: z
    .strictObject({
      /** Tasks that waited, cancelled as no longer applying; the seat stays as it was. */
      cancelled: z.number().int().nonnegative(),
      /** Tasks in progress, left to the IT Admin who works them to close by what happened at the provider. */
      itAdminToClose: z.number().int().nonnegative(),
      /** Tasks that go on because another source still asks for the revocation of the seat. */
      continues: z.number().int().nonnegative(),
      /** Tasks already completed (a K1 seat whose access runs on to the end of the paid period): nothing was taken back, nothing is left to close. */
      alreadyDone: z.number().int().nonnegative(),
    })
    .optional(),
  priorWorkState: z.enum(['WORKING', 'ON_LONG_LEAVE']),
  departureEffectiveOn: z.string(),
  /** The basis of the departure in one box, what a form fills in again. Null in the minimal projection an IT Admin reads. */
  groundsNote: z.string().nullable(),
  /** Who follows the head of the department the person leaves; null when they did not head it, and in the minimal projection. */
  headSuccessor: z.strictObject({ kind: z.enum(['EMPLOYEE', 'NONE']), employee: employeeBrief.nullable() }).nullable(),
  /** The account that recorded it; null when the controlled procedure did (`recordedByProcedure`). */
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
  /** A task can take it away: false only for K3 (SSO/SCIM), which is specified and has no revocation; K4 is revoked and its key goes back to the store. */
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
  /** Always null since `QĐ-110g` (no handover is confirmed): the key stays until the clients stop reading it, then goes. */
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
    'ACCESS_BLOCKED',
    'REVOCATIONS_WITHDRAWN',
    'IT_ADMIN_HANDED_OVER',
    'CLOSED_BY_SYSTEM',
    'MAILBOX_LOCKED',
  ]),
  oldLastWorkingDay: z.string().nullable(),
  newLastWorkingDay: z.string().nullable(),
  reason: z.string().nullable(),
  /** For the revocations opened: how many rights were asked for. */
  count: z.number().int().nonnegative().nullable(),
  /** The account that did it; null when the controlled procedure did (`changedByProcedure`). */
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
