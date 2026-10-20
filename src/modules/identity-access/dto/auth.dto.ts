import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/**
 * Deliberately loose: the email is not format-checked here, because a malformed address must
 * get the same answer as an unknown one (US-01-01 AC-10). Only size bounds are enforced.
 */
export const loginBodySchema = z.strictObject({
  email: z.string().max(254).meta({ example: 'user@example.com' }),
  password: z.string().min(1).max(256).meta({ example: '<password>' }),
});

export const sessionTokenSchema = z.strictObject({
  accessToken: z.string().meta({ example: '<access-token>' }),
  tokenType: z.literal('Bearer'),
  expiresAt: z.iso.datetime().meta({
    description: 'Expiry of the access token in this response.',
    example: '2026-01-01T00:10:00.000Z',
  }),
  /** Opaque and single-use: exchanged at `/auth/refresh` for a new pair, or ended at `/auth/logout`. */
  refreshToken: z.string().meta({ example: '<refresh-token>' }),
  refreshExpiresAt: z.iso.datetime().meta({
    description:
      'Expiry of the refresh token in this response: the session idle timeout, capped at the absolute session ' +
      'expiry. It can be earlier than expiresAt near the end of a session.',
    example: '2026-01-01T08:00:00.000Z',
  }),
});

/**
 * The refresh token travels in the body of `/auth/refresh` and `/auth/logout`. Only size-bounded: a
 * token of the wrong shape is answered like an unknown one (401), not described.
 */
export const refreshTokenBodySchema = z.strictObject({
  refreshToken: z.string().min(1).max(512).meta({ example: '<refresh-token>' }),
});

/**
 * Unlike login, the email here is checked for shape: that answer depends on the request alone, never
 * on which accounts exist, so it reveals nothing (AC-3).
 */
export const passwordResetRequestBodySchema = z.strictObject({
  email: z.string().trim().min(1).max(320).pipe(z.email()),
});

const passwordResetRequestedSchema = z.strictObject({ requested: z.literal(true) });

export const passwordResetBodySchema = z.strictObject({
  token: z.string().min(1).max(256).meta({ example: '<reset-token>' }),
  // Only bounded here: the password policy answers with its own error code and must run before the token is examined.
  newPassword: z.string().min(1).max(1024).meta({ example: '<new-password>' }),
});

const passwordResetDoneSchema = z.strictObject({ passwordReset: z.literal(true) });

export const changePasswordBodySchema = z.strictObject({
  currentPassword: z.string().min(1).max(256).meta({ example: '<current-password>' }),
  // Only bounded here (AUTH.2 / F-31: the same 1024 as the reset): the password policy answers with its own error code.
  newPassword: z.string().min(1).max(1024).meta({ example: '<new-password>' }),
});

const passwordChangedSchema = z.strictObject({ passwordChanged: z.literal(true) });

export class LoginBodyDto extends createZodDto(loginBodySchema) {}
export class RefreshTokenBodyDto extends createZodDto(refreshTokenBodySchema) {}
export class PasswordResetRequestBodyDto extends createZodDto(passwordResetRequestBodySchema) {}
export class PasswordResetRequestedResponseDto extends createZodDto(
  successEnvelopeSchema(passwordResetRequestedSchema),
) {}
export class PasswordResetBodyDto extends createZodDto(passwordResetBodySchema) {}
export class PasswordResetResponseDto extends createZodDto(successEnvelopeSchema(passwordResetDoneSchema)) {}
export class ChangePasswordBodyDto extends createZodDto(changePasswordBodySchema) {}
export class PasswordChangedResponseDto extends createZodDto(successEnvelopeSchema(passwordChangedSchema)) {}
export class SessionTokenResponseDto extends createZodDto(successEnvelopeSchema(sessionTokenSchema)) {}
