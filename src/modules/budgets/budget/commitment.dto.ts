import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });

/** What Finance may narrow the commitments by (`US-06-07` AC-1, AC-7; `US-06-09` AC-2). */
export const commitmentListQuerySchema = z.strictObject({
  /** `false` lists the commitments that wait for a budget, the input of the proposal of the next year. */
  attached: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  costCenterId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** One commitment: what it holds, for which request, and whether it is attached to a budget or waits for one. */
const commitmentSchema = z.strictObject({
  id: z.uuid(),
  requestId: z.uuid(),
  costCenter: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  year: z.number().int(),
  /** What the commitment was made for; `held` is what it holds now and `released` what went back to the budget. */
  amount: moneyView,
  released: moneyView,
  held: moneyView,
  state: z.enum(['HELD', 'RELEASED', 'EXPENSED']),
  attached: z.boolean(),
  attachedAt: z.iso.datetime().nullable(),
  /** Why it waits: there is no budget for its Cost Center and year yet. Finance has nothing to confirm (`QĐ-82m` B). */
  unattachedReason: z.enum(['NO_BUDGET']).nullable(),
  createdAt: z.iso.datetime(),
});

/** Finance lets what is left of a commitment go, with the reason (`US-06-06` AC-6). */
export const releaseBodySchema = z.strictObject({ reason: z.string().trim().min(1).max(1000) });

export const commitmentIdParamSchema = z.strictObject({ id: z.uuid() });

export const releaseListQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** One time money went back to the budget: how much, why, and who when a person did it. */
const releaseSchema = z.strictObject({
  id: z.uuid(),
  amount: moneyView,
  reason: z.enum(['REQUEST_CANCELLED', 'REQUEST_WITHDRAWN', 'GRANT_FAILED', 'PARTICIPANT_WITHDRAWN', 'REMAINDER']),
  /** Why Finance let the remainder go; the other reasons are the event itself. */
  reasonText: z.string().nullable(),
  releasedBy: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }).nullable(),
  releasedAt: z.iso.datetime(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class CommitmentListQueryDto extends createZodDto(commitmentListQuerySchema) {}
export class ReleaseBodyDto extends createZodDto(releaseBodySchema) {}
export class CommitmentIdParamDto extends createZodDto(commitmentIdParamSchema) {}
export class ReleaseListQueryDto extends createZodDto(releaseListQuerySchema) {}
export class CommitmentResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ commitment: commitmentSchema })),
) {}
export class ReleaseListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(releaseSchema), pagination })),
) {}
export class CommitmentListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(commitmentSchema), pagination })),
) {}

export type CommitmentWire = z.infer<typeof commitmentSchema>;
export type ReleaseWire = z.infer<typeof releaseSchema>;
