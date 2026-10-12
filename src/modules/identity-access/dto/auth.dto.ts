import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/**
 * Deliberately loose: the email is not format-checked here, because a malformed address must
 * get the same answer as an unknown one (US-01-01 AC-10). Only size bounds are enforced.
 */
export const loginBodySchema = z.strictObject({
  email: z.string().max(254),
  password: z.string().min(1).max(256),
});

export const sessionTokenSchema = z.strictObject({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresAt: z.iso.datetime(),
});

export class LoginBodyDto extends createZodDto(loginBodySchema) {}
export class SessionTokenResponseDto extends createZodDto(successEnvelopeSchema(sessionTokenSchema)) {}
