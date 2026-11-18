import { z } from 'zod';
import { successEnvelopeSchema } from '../../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../../infrastructure/http/dto/zod-dto';

export const enrollmentBodySchema = z.strictObject({ enrollmentCode: z.string().trim().min(1).max(32) });
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

const instant = z.iso.datetime();

export const issuedCredentialSchema = z.strictObject({ token: z.string(), expiresAt: instant });

export class EnrollmentBodyDto extends createZodDto(enrollmentBodySchema) {}
export class EnrolledCredentialResponseDto extends createZodDto(successEnvelopeSchema(issuedCredentialSchema)) {}
