import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const avatarLinkSchema = z.strictObject({
  url: z.url().meta({ description: 'A link to the picture that stops working at expiresAt; ask again for a new one.' }),
  expiresAt: z.iso.datetime(),
});

const workPhoneSchema = z.string().trim().max(40).nullable().meta({
  description:
    '8 to 15 digits with an optional leading +; spaces, dots and dashes are ignored; null or blank clears it.',
});

export const workPhoneBodySchema = z.strictObject({ workPhone: workPhoneSchema });

export const employeeProfileLookupBodySchema = z.strictObject({
  employeeIds: z.array(z.uuid()).min(1).max(100),
});

export const appUserIdParamSchema = z.strictObject({ id: z.uuid() });

export const removeAvatarBodySchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .meta({ description: 'Why the Super Admin removes the picture; kept in the audit trail.' }),
});

export const avatarResultSchema = z.strictObject({ avatar: avatarLinkSchema.nullable() });
export const workPhoneResultSchema = z.strictObject({ workPhone: z.string().nullable() });

export const employeeProfileSchema = z.strictObject({
  employeeId: z.uuid(),
  avatar: avatarLinkSchema.nullable(),
  workPhone: z.string().nullable(),
});

export class WorkPhoneBodyDto extends createZodDto(workPhoneBodySchema) {}
export class EmployeeProfileLookupBodyDto extends createZodDto(employeeProfileLookupBodySchema) {}
export class AppUserIdParamDto extends createZodDto(appUserIdParamSchema) {}
export class RemoveAvatarBodyDto extends createZodDto(removeAvatarBodySchema) {}
export class AvatarResultResponseDto extends createZodDto(successEnvelopeSchema(avatarResultSchema)) {}
export class WorkPhoneResultResponseDto extends createZodDto(successEnvelopeSchema(workPhoneResultSchema)) {}
export class EmployeeProfileLookupResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(employeeProfileSchema).max(100) })),
) {}

/** The two things `GET /me` adds: shared with the schema of that route so the two never differ. */
export const selfServiceProfileShape = {
  avatar: avatarLinkSchema.nullable(),
  workPhone: z.string().nullable(),
} as const;
