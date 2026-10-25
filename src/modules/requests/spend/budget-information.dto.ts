import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const text = (max: number) => z.string().trim().min(1).max(max);
const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/** What the spending approver asks (`US-06-02` AC-1): a question, and nothing that decides. */
export const askBodySchema = z.strictObject({ question: text(2000) });

/** What Finance answers (`US-06-03` AC-1, AC-3): one of three values and a note; no field changes the check. */
export const answerBodySchema = z.strictObject({
  answer: z.enum(['WITHIN_LIMIT', 'OVER_LIMIT', 'NO_BUDGET']),
  note: text(2000).optional(),
});

export const informationQuerySchema = z.strictObject({
  state: z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const requestInformationQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const informationIdParamSchema = z.strictObject({ id: z.uuid() });

/** One question to Finance and, when there is one, its answer. */
export const budgetInformationSchema = z.strictObject({
  id: z.uuid(),
  requestId: z.uuid(),
  stepId: z.uuid(),
  question: z.string(),
  askedBy: employeeRef,
  askedAt: z.iso.datetime(),
  state: z.enum(['OPEN', 'ANSWERED', 'CLOSED']),
  /** What Finance said; null while it has not, and for a question that was closed. */
  answer: z
    .strictObject({
      value: z.enum(['WITHIN_LIMIT', 'OVER_LIMIT', 'NO_BUDGET']),
      note: z.string().nullable(),
      answeredBy: employeeRef,
      answeredAt: z.iso.datetime(),
      /** How long Finance took, kept apart from the time the spend step waits (`US-06-02` AC-5). */
      responseSeconds: z.number().int().nonnegative(),
    })
    .nullable(),
  closedAt: z.iso.datetime().nullable(),
  closeReason: z.enum(['REQUEST_WITHDRAWN', 'REQUEST_CANCELLED', 'STEP_CLOSED']).nullable(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class AskBodyDto extends createZodDto(askBodySchema) {}
export class AnswerBodyDto extends createZodDto(answerBodySchema) {}
export class InformationQueryDto extends createZodDto(informationQuerySchema) {}
export class RequestInformationQueryDto extends createZodDto(requestInformationQuerySchema) {}
export class InformationIdParamDto extends createZodDto(informationIdParamSchema) {}
export class InformationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ budgetInformation: budgetInformationSchema })),
) {}
export class InformationListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(budgetInformationSchema), pagination })),
) {}

export type BudgetInformationWire = z.infer<typeof budgetInformationSchema>;
