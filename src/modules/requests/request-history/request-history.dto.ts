import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { employeeRef, requestSchema, requestStateSchema } from '../access-request/access-request.dto';
import { myRequestSummarySchema, refineWindow, requestListQueryShape } from '../my-requests/my-requests.dto';
import { isFlagList } from './request-history.policy';
import { REQUEST_AUDIT_FLAGS, REQUEST_EVENT_KINDS } from './request-history.types';

const instant = z.iso.datetime({ offset: true });
const page = z.coerce.number().int().positive().default(1);
const pageSize = z.coerce.number().int().positive().max(100).default(20);

const paginationSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
const pageOfSchema = <T extends z.ZodType>(item: T) =>
  z.strictObject({ items: z.array(item), pagination: paginationSchema });

export const historyIdParamSchema = z.strictObject({ id: z.uuid() });

/** Strict: a parameter that is not here is refused. The department is the path; `employeeId` only narrows within it. */
export const departmentHistoryQuerySchema = z
  .strictObject({
    ...requestListQueryShape,
    employeeId: z.uuid().optional().meta({
      description: 'Only the requests this person sent or is one of the people for, within the department.',
    }),
  })
  .superRefine(refineWindow);

/** Strict: what the role of the caller reaches is never widened by a parameter, only narrowed. */
export const oversightHistoryQuerySchema = z
  .strictObject({
    ...requestListQueryShape,
    departmentId: z.uuid().optional().meta({ description: 'Only the requests sent from this department.' }),
    employeeId: z.uuid().optional().meta({
      description: 'Only the requests this person sent or is one of the people for.',
    }),
    flag: z.string().max(40).refine(isFlagList, 'A comma-separated list of ONE_STEP, RESERVE_USED.').optional().meta({
      description:
        'One or both of ONE_STEP (sent through the one-step route) and RESERVE_USED (the head confirmed the use of the reserve of the budget), comma-separated and none twice; a request has every flag named.',
    }),
  })
  .superRefine(refineWindow);

export const requestEventsQuerySchema = z.strictObject({ page, pageSize });

export const auditFlagQuerySchema = z
  .strictObject({
    flag: z.enum(REQUEST_AUDIT_FLAGS).default('NO_NEED_APPROVER').meta({
      description:
        'NO_NEED_APPROVER (the default): free internal software sent through the one-step route, so no head approved the need.',
    }),
    from: instant.optional().meta({
      description: 'The first moment the request was sent that is read (included). Must be earlier than to.',
    }),
    to: instant
      .optional()
      .meta({ description: 'The moment after the last one the request was sent that is read (excluded).' }),
    page,
    pageSize,
  })
  .superRefine(refineWindow);

const departmentRef = z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() });

/**
 * A request as a row of the history the people who oversee requests read: what it is, who sent it and for whom, from which department,
 * where it stands and who it waits for, how it ended, and whether the head confirmed the reserve. No price, amount, figure of a budget,
 * result of a check, commitment or reason Finance wrote: those are read by the routes of money, each by its own role.
 */
export const accessRequestHistoryItemSchema = myRequestSummarySchema
  .omit({ canWithdraw: true, involvement: true, myLine: true })
  .extend({
    requester: employeeRef,
    department: departmentRef,
    /** The head confirmed the use of the reserve of the budget for it: the fact, never the figure. */
    reserveUsed: z.boolean(),
  });

/** A row of the history of a department, as its head reads it: the row of the history and whether it waits for the head now. */
export const departmentAccessRequestItemSchema = accessRequestHistoryItemSchema.extend({
  /** It waits for the head now: the need step they hold, or the queue of the head to send it on as spend. */
  awaitingMe: z.boolean(),
});

/** One entry of the history of a request: what happened, when, who did it in which role, for which person of a group, and why. */
export const requestEventSchema = z.strictObject({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  kind: z.enum(REQUEST_EVENT_KINDS),
  /** The person who acted; null when the system did. */
  actor: employeeRef.nullable(),
  actorKind: z.enum(['USER', 'SYSTEM']),
  /** The role the person decided in (MANAGER, SPENDING_APPROVER...), when the entry is a decision. */
  actorRole: z.string().nullable(),
  /** The person of a request for a group the entry is about; null for an entry about the whole request. */
  line: employeeRef.nullable(),
  /** What a person wrote when they refused, withdrew, closed, returned or used the reserve; null otherwise. */
  reason: z.string().nullable(),
});

/**
 * A request on the audit report of the Super Admin: who sent it, from where, for which software, why no head approved its need, and who
 * granted it and when. No price, amount, budget, commitment, evidence or reason the requester wrote.
 */
export const requestAuditFlagItemSchema = z.strictObject({
  requestId: z.uuid(),
  flag: z.enum(REQUEST_AUDIT_FLAGS),
  submittedAt: z.iso.datetime(),
  state: requestStateSchema,
  requester: employeeRef,
  department: departmentRef,
  application: z.strictObject({ id: z.uuid(), name: z.string() }),
  plan: z.strictObject({ id: z.uuid(), name: z.string() }),
  /** Why the request went the one-step route: the requester heads the department, or it has no head. */
  routingReason: requestSchema.shape.routing.shape.oneStepReason,
  /** Who completed the grant and when; null until it is completed. The IT Admin is null when their account is gone. */
  grant: z.strictObject({ itAdmin: employeeRef.nullable(), completedAt: z.iso.datetime() }).nullable(),
});

export type AccessRequestHistoryItemWire = z.infer<typeof accessRequestHistoryItemSchema>;
export type DepartmentAccessRequestItemWire = z.infer<typeof departmentAccessRequestItemSchema>;
export type RequestEventWire = z.infer<typeof requestEventSchema>;
export type RequestAuditFlagItemWire = z.infer<typeof requestAuditFlagItemSchema>;

export class HistoryIdParamDto extends createZodDto(historyIdParamSchema) {}
export class DepartmentHistoryQueryDto extends createZodDto(departmentHistoryQuerySchema) {}
export class OversightHistoryQueryDto extends createZodDto(oversightHistoryQuerySchema) {}
export class RequestEventsQueryDto extends createZodDto(requestEventsQuerySchema) {}
export class AuditFlagQueryDto extends createZodDto(auditFlagQuerySchema) {}
export class DepartmentAccessRequestPageResponseDto extends createZodDto(
  successEnvelopeSchema(pageOfSchema(departmentAccessRequestItemSchema)),
) {}
export class AccessRequestHistoryPageResponseDto extends createZodDto(
  successEnvelopeSchema(pageOfSchema(accessRequestHistoryItemSchema)),
) {}
export class RequestEventPageResponseDto extends createZodDto(
  successEnvelopeSchema(pageOfSchema(requestEventSchema)),
) {}
export class RequestAuditFlagPageResponseDto extends createZodDto(
  successEnvelopeSchema(pageOfSchema(requestAuditFlagItemSchema)),
) {}
