import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const instant = z.iso.datetime({ offset: true });

/** The batches Finance may narrow the list by. Strict: an unknown parameter is refused rather than ignored. */
export const spendBatchListQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    departmentId: z.uuid().optional(),
    submittedFrom: instant
      .meta({
        description:
          'Must be earlier than submittedTo when both are given: the window includes submittedFrom and excludes submittedTo.',
      })
      .optional(),
    submittedTo: instant.optional(),
  })
  .superRefine((query, context) => {
    if (
      query.submittedFrom !== undefined &&
      query.submittedTo !== undefined &&
      new Date(query.submittedFrom) >= new Date(query.submittedTo)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['submittedFrom'],
        message: 'submittedFrom must be earlier than submittedTo (the window is half-open).',
      });
    }
  });

/** One batch of the list: who sent it, when, and how many of its requests are decided, with what they came to. */
const spendBatchListItemSchema = z.strictObject({
  id: z.uuid(),
  department: z.strictObject({ id: z.uuid(), name: z.string() }),
  submittedBy: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
  submittedAt: z.iso.datetime(),
  itemCount: z.number().int().positive(),
  /** Requests of the batch that were approved for spend, so that money is committed for them. */
  approvedCount: z.number().int().nonnegative(),
  /** Requests sent on that have no decision of spend yet. */
  pendingCount: z.number().int().nonnegative(),
  /** What the approved requests were committed for, keyed by currency code. */
  approvedAmounts: z.record(z.string(), z.string()),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class SpendBatchListQueryDto extends createZodDto(spendBatchListQuerySchema) {}
export class SpendBatchListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(spendBatchListItemSchema), pagination })),
) {}

export type SpendBatchListItemWire = z.infer<typeof spendBatchListItemSchema>;
