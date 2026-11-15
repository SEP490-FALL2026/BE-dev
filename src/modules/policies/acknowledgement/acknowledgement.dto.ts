import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const acknowledgementReportQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const acknowledgementSchema = z.strictObject({
  policyCode: z.string(),
  versionNumber: z.number().int().positive(),
  acknowledgedAt: z.iso.datetime().nullable().meta({
    description:
      'When it was written now; null when the account had acknowledged the policy already and nothing was written.',
  }),
  alreadyAcknowledged: z.boolean(),
});

export const acknowledgementReportRowSchema = z.strictObject({
  employeeId: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  state: z.enum(['DONE', 'PENDING']),
  versionNumber: z
    .number()
    .int()
    .positive()
    .nullable()
    .meta({ description: 'The latest version this person acknowledged, if any.' }),
  acknowledgedAt: z.iso.datetime().nullable(),
});

export class AcknowledgementReportQueryDto extends createZodDto(acknowledgementReportQuerySchema) {}
export class AcknowledgementResponseDto extends createZodDto(successEnvelopeSchema(acknowledgementSchema)) {}
export class AcknowledgementReportResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      policyCode: z.string(),
      currentVersionNumber: z.number().int().positive(),
      items: z.array(acknowledgementReportRowSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
