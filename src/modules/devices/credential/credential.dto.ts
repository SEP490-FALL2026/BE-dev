import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const credentialListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const credentialRevocationBodySchema = z.strictObject({ reason: z.string().trim().min(1).max(1000) });
export const credentialIdParamSchema = z.strictObject({ id: z.uuid() });

export const enrollmentCodeBodySchema = z
  .strictObject({
    collectorKind: z.enum(['AI_COLLECTOR', 'BROWSER_EXTENSION']),
    maxUses: z
      .number()
      .int()
      .min(1)
      .max(5)
      .meta({
        description:
          'Only for a browser extension: how many browser profiles may use the code (shared by a policy); 1 when omitted. An AI collector takes exactly one.',
      })
      .optional(),
  })
  .superRefine((body, context) => {
    if (body.collectorKind === 'AI_COLLECTOR' && body.maxUses !== undefined) {
      context.addIssue({ code: 'custom', path: ['maxUses'], message: 'An AI collector takes exactly one use.' });
    }
  });
export const registrationIdParamSchema = z.strictObject({ id: z.uuid() });

const instant = z.iso.datetime();

export const enrollmentCodeSchema = z.strictObject({
  code: z
    .string()
    .meta({ description: 'The code as XXXX-XXXX-XXXX; it is shown this once and only its hash is kept.' }),
  collectorKind: z.enum(['AI_COLLECTOR', 'BROWSER_EXTENSION']),
  maxUses: z.number().int().positive(),
  expiresAt: instant,
});

export const credentialSummarySchema = z.strictObject({
  id: z.uuid(),
  collectorKind: z.enum(['AI_COLLECTOR', 'BROWSER_EXTENSION']),
  issuedAt: instant,
  expiresAt: instant,
  lastAcceptedAt: instant.nullable(),
  revokedAt: instant.nullable(),
  revocationCause: z.enum(['IT_ADMIN', 'REGISTRATION_ENDED', 'REPLACED']).nullable(),
  revocationReason: z.string().nullable(),
});

export class CredentialListQueryDto extends createZodDto(credentialListQuerySchema) {}
export class CredentialRevocationBodyDto extends createZodDto(credentialRevocationBodySchema) {}
export class CredentialIdParamDto extends createZodDto(credentialIdParamSchema) {}
export class CredentialSummaryResponseDto extends createZodDto(successEnvelopeSchema(credentialSummarySchema)) {}
export class CredentialPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(credentialSummarySchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}

export class EnrollmentCodeBodyDto extends createZodDto(enrollmentCodeBodySchema) {}
export class RegistrationIdParamDto extends createZodDto(registrationIdParamSchema) {}
export class EnrollmentCodeResponseDto extends createZodDto(successEnvelopeSchema(enrollmentCodeSchema)) {}
