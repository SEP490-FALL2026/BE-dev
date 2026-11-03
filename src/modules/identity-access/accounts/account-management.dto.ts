import { z } from 'zod';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/**
 * The six roles an account can hold (QĐ-93a): one list for the roles a client sends, filters by and reads back — the same as the
 * `AppRole` of `identity-access.types.ts`. MANAGER only has an effect while its holder heads a department; SPENDING_APPROVER is
 * held by at most one account.
 */
export const appRoleSchema = z.enum(['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER']);
export const requestedRoleSchema = appRoleSchema;

export const createAppUserBodySchema = z.strictObject({
  employeeId: z.uuid(),
  loginEmail: z.string().max(254).optional(),
  roles: z.array(requestedRoleSchema).max(6).default([]),
});

export const grantRoleBodySchema = z.strictObject({ role: requestedRoleSchema });

/** Lock and unlock both require one reason or authority reference; it is stored trimmed in the Audit Trail. */
export const accountStatusChangeBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000).meta({ example: '<reason-or-authority-reference>' }),
});

export const appUserIdParamSchema = z.strictObject({ id: z.uuid() });
export const appUserRoleParamSchema = z.strictObject({ id: z.uuid(), role: requestedRoleSchema });

export const listAppUsersQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['ACTIVE', 'LOCKED']).optional(),
    activationState: z.enum(['INVITED', 'ACTIVATED']).optional(),
    role: appRoleSchema.optional(),
    departmentId: z.uuid().optional(),
    memberOn: businessDate.optional(),
    employeeLeft: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .refine((query) => query.memberOn === undefined || query.departmentId !== undefined, {
    path: ['memberOn'],
    message: 'departmentId is required with memberOn',
  });

export const accountCandidatesQuerySchema = z.strictObject({ search: z.string().trim().max(100).optional() });

export const redeemInvitationBodySchema = z.strictObject({
  token: z.string().min(1).max(256).meta({ example: '<invitation-token>' }),
  // Only bounded here: the password policy answers with its own error code and must run before the token is examined.
  password: z.string().min(1).max(1024).meta({ example: '<password>' }),
});

const accountSchema = z.strictObject({
  id: z.uuid(),
  loginEmail: z.string(),
  status: z.enum(['ACTIVE', 'LOCKED']),
  activationState: z.enum(['INVITED', 'ACTIVATED']),
  createdAt: z.iso.datetime(),
  employee: z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() }).nullable(),
  roles: z.array(appRoleSchema),
});

const accountDetailSchema = accountSchema.extend({
  roleHistory: z.array(
    z.strictObject({ role: appRoleSchema, grantedAt: z.iso.datetime(), revokedAt: z.iso.datetime().nullable() }),
  ),
  roleHistoryHasMore: z.boolean(),
  invitation: z
    .strictObject({
      usable: z.boolean(),
      expiresAt: z.iso.datetime(),
      delivery: z
        .strictObject({
          status: z.enum(['PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED']),
          attempts: z.number().int(),
          lastErrorCode: z.string().nullable(),
          sentAt: z.iso.datetime().nullable(),
        })
        .nullable(),
    })
    .nullable(),
});

const accountPageSchema = z.strictObject({
  items: z.array(accountSchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

const candidatesSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      employeeCode: z.string(),
      fullName: z.string(),
      workEmail: z.string().nullable(),
      department: z.string().nullable(),
      unplaced: z.boolean(),
    }),
  ),
});

const activatedSchema = z.strictObject({ activated: z.literal(true) });

export class CreateAppUserBodyDto extends createZodDto(createAppUserBodySchema) {}
export class GrantRoleBodyDto extends createZodDto(grantRoleBodySchema) {}
export class AccountStatusChangeBodyDto extends createZodDto(accountStatusChangeBodySchema) {}
export class AppUserIdParamDto extends createZodDto(appUserIdParamSchema) {}
export class AppUserRoleParamDto extends createZodDto(appUserRoleParamSchema) {}
export class ListAppUsersQueryDto extends createZodDto(listAppUsersQuerySchema) {}
export class AccountCandidatesQueryDto extends createZodDto(accountCandidatesQuerySchema) {}
export class RedeemInvitationBodyDto extends createZodDto(redeemInvitationBodySchema) {}

export class AccountDetailResponseDto extends createZodDto(successEnvelopeSchema(accountDetailSchema)) {}
export class AccountPageResponseDto extends createZodDto(successEnvelopeSchema(accountPageSchema)) {}
export class AccountCandidatesResponseDto extends createZodDto(successEnvelopeSchema(candidatesSchema)) {}
export class AccountActivatedResponseDto extends createZodDto(successEnvelopeSchema(activatedSchema)) {}
