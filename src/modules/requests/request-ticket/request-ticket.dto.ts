import { z } from 'zod';
import type { TermRefusal } from '../../../core/term-limit';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { checklistBodySchema } from '../../policies/public/policy-checklist.types';
import {
  REASON_MAX_LENGTH,
  employeeRef,
  requestIdParamSchema,
  requestStateSchema,
  submitBodySchema,
} from '../access-request/access-request.dto';
import { MAX_TICKET_ITEMS } from './request-ticket.policy';

export const TICKET_SUBMIT_BODY_MAX_ITEMS = 20;

const TERM_REFUSAL_REASONS = [
  'TERM_REQUIRED',
  'TERM_MONTHS_OUT_OF_RANGE',
  'TERM_NOT_ASKED',
  'TERM_LONG_TERM_NOT_ALLOWED',
  'TERM_CONTRACT_ENDED',
  'K1_ANNUAL_TERM_FIXED',
  'K1_ANNUAL_CONTRACT_TOO_SHORT',
] as const satisfies readonly TermRefusal[];

export const TICKET_ITEM_REASONS = [
  'PLAN_NOT_FOUND',
  'APPLICATION_RETIRED',
  'PLAN_BOUND_TO_DEVICE',
  'NOT_PRICEABLE',
  'NOT_PAID_IN_CATALOG',
  'HAS_ACCESS',
  ...TERM_REFUSAL_REASONS,
  'HAS_OPEN_REQUEST',
  'DUPLICATE_IN_TICKET',
  'OPEN_LIMIT_REACHED',
] as const;

export const ticketItemReasonSchema = z.enum(TICKET_ITEM_REASONS);

export const ticketItemRefusalSchema = z.strictObject({
  position: z.number().int().positive(),
  planId: z.uuid(),
  reason: ticketItemReasonSchema,
  duplicateOfPosition: z.number().int().positive().optional(),
  openRequestId: z.uuid().optional(),
  resetsOn: z.string().optional(),
  contractEndDate: z.string().nullable().optional(),
  maxMonths: z.number().int().positive().optional(),
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']).optional(),
});

export const ticketRefSchema = z.strictObject({
  id: z.uuid(),
  position: z.number().int().min(1).max(MAX_TICKET_ITEMS),
  itemCount: z.number().int().min(1).max(MAX_TICKET_ITEMS),
});

export const ticketLatestReplySchema = z.strictObject({
  kind: z.enum(['REQUESTER_RESUBMISSION', 'HEAD_RESUBMISSION']),
  note: z.string(),
  author: z.strictObject({ id: z.uuid(), name: z.string() }),
  createdAt: z.iso.datetime(),
});

export const ticketItemSchema = z.strictObject({
  position: z.number().int().min(1).max(MAX_TICKET_ITEMS),
  requestId: z.uuid(),
  plan: z.strictObject({ id: z.uuid(), name: z.string() }),
  state: requestStateSchema,
  termMonths: z.number().int().positive().nullable(),
  routingMode: z.enum(['VIA_HEAD', 'ONE_STEP']),
  latestReply: ticketLatestReplySchema.nullable(),
});

export const ticketSchema = z.strictObject({
  id: z.uuid(),
  requester: employeeRef,
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  submittedAt: z.iso.datetime(),
  status: z.enum(['IN_PROGRESS', 'DONE']),
  items: z.array(ticketItemSchema).max(MAX_TICKET_ITEMS),
});

export const ticketSubmitBodySchema = z.strictObject({
  items: z.array(submitBodySchema).min(1).max(TICKET_SUBMIT_BODY_MAX_ITEMS).meta({
    description:
      'Items to request in one ticket (at most 6 items; 7 to 20 items return an item-limit error, more than 20 is rejected as invalid input).',
  }),
});

export const ticketDecideBodySchema = z.strictObject({
  requestIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_TICKET_ITEMS)
    .meta({ uniqueItems: true })
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate requestIds are not allowed'),
  decision: z.enum(['APPROVE', 'REJECT', 'RETURN']),
  reason: z.string().trim().min(1).max(REASON_MAX_LENGTH).optional(),
  checklist: checklistBodySchema,
});

export const ticketWithdrawBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(REASON_MAX_LENGTH).optional(),
});

export const ticketNeedResultSchema = z.strictObject({
  requestId: z.uuid(),
  outcome: z.enum(['APPROVED', 'REJECTED', 'RETURNED', 'SKIPPED', 'RETRYABLE']),
  reason: z
    .enum([
      'NOT_IN_TICKET',
      'OWN_REQUEST',
      'NOT_THE_ASSIGNEE',
      'STEP_NOT_PENDING',
      'ALREADY_DECIDED',
      'TRANSIENT_FAILURE',
    ])
    .nullable(),
});

export const ticketSpendResultSchema = z.strictObject({
  requestId: z.uuid(),
  outcome: z.enum(['APPROVED', 'REJECTED', 'RETURNED', 'SKIPPED', 'RETRYABLE']),
  reason: z
    .enum([
      'NOT_IN_TICKET',
      'USE_BATCH',
      'NO_SPEND_STEP',
      'NOT_THE_ASSIGNEE',
      'OWN_REQUEST',
      'NOT_CHECKABLE',
      'RECHECKED_RETURNED_TO_REQUESTER',
      'COMMITMENT_NOT_HOLDABLE',
      'ALREADY_DECIDED',
      'TRANSIENT_FAILURE',
    ])
    .nullable(),
});

export const ticketWithdrawResultSchema = z.strictObject({
  requestId: z.uuid(),
  outcome: z.enum(['WITHDRAWN', 'SKIPPED', 'RETRYABLE']),
  reason: z
    .enum([
      'WITHDRAWAL_AFTER_DECISION',
      'ALREADY_ENDED',
      'WITHDRAWAL_PENDING',
      'GRANT_RUNNING',
      'GRANT_COMPLETED',
      'ALREADY_WITHDRAWN',
      'NOT_IN_TICKET',
      'TRANSIENT_FAILURE',
    ])
    .nullable(),
});

export class TicketIdParamDto extends createZodDto(requestIdParamSchema) {}
export class TicketSubmitBodyDto extends createZodDto(ticketSubmitBodySchema) {}
export class TicketDecideBodyDto extends createZodDto(ticketDecideBodySchema) {}
export class TicketWithdrawBodyDto extends createZodDto(ticketWithdrawBodySchema) {}
export class TicketResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ ticket: ticketSchema }))) {}
export class TicketNeedDecisionResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ results: z.array(ticketNeedResultSchema).max(MAX_TICKET_ITEMS) })),
) {}
export class TicketSpendDecisionResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ results: z.array(ticketSpendResultSchema).max(MAX_TICKET_ITEMS) })),
) {}
export class TicketWithdrawalResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ results: z.array(ticketWithdrawResultSchema).max(MAX_TICKET_ITEMS) })),
) {}

export type TicketRefWire = z.infer<typeof ticketRefSchema>;
export type TicketWire = z.infer<typeof ticketSchema>;
export type TicketItemRefusalWire = z.infer<typeof ticketItemRefusalSchema>;
export type TicketSubmitBody = z.infer<typeof ticketSubmitBodySchema>;
export type TicketDecideBody = z.infer<typeof ticketDecideBodySchema>;
export type TicketWithdrawBody = z.infer<typeof ticketWithdrawBodySchema>;
export type TicketNeedResultWire = z.infer<typeof ticketNeedResultSchema>;
export type TicketSpendResultWire = z.infer<typeof ticketSpendResultSchema>;
export type TicketWithdrawResultWire = z.infer<typeof ticketWithdrawResultSchema>;
