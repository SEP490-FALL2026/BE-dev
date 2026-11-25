import { z } from 'zod';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/**
 * Only the shape and a generous bound are checked here; who may be named and how many is judged by the policy and answers with its own
 * `WORKSPACE.*` code. A workspace has no field for a password: the objects are strict.
 */
export const WORKSPACE_ADMINS_MAX = 20;
export const WORKSPACE_FLAGS_MAX = 3;
export const WORKSPACE_ADMIN_FLAGS_MAX = 1;
const role = z.enum(['OWNER', 'ADMIN']);
const flag = z.enum(['ADMINS_BELOW_MINIMUM', 'NO_OWNER_EMAIL', 'NO_RESPONSIBLE']);
const adminFlag = z.enum(['ADMIN_NOT_WORKING']);

const email = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .pipe(z.email())
  .meta({ description: 'The email of the company account that owns the workspace at the vendor (never a password).' });
const emergencyAccount = z.strictObject({
  identity: z.string().max(1000),
  occupiesSeat: z.boolean(),
  holderEmployeeId: z.uuid(),
  lastReviewedOn: businessDate,
});
const version = z.iso.datetime().meta({ description: 'The updatedAt of the workspace as the caller read it.' });

export const workspaceIdParamSchema = z.strictObject({ id: z.uuid() });

export const listWorkspacesQuerySchema = z.strictObject({
  vendorId: z.uuid().optional().meta({ description: 'Only the workspaces at this vendor.' }),
  flag: flag.optional().meta({ description: 'Only the workspaces that carry this flag.' }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const createWorkspaceBodySchema = z.strictObject({
  vendorId: z.uuid().meta({ description: 'The vendor the workspace is held at; it never changes.' }),
  name: z.string().trim().min(1).max(200),
  ownerAccountEmail: email.optional(),
  adminNote: z.string().max(2000).optional(),
});

export const updateWorkspaceBodySchema = z
  .strictObject({
    expectedUpdatedAt: version,
    name: z.string().trim().min(1).max(200).optional(),
    ownerAccountEmail: email.nullable().optional(),
    adminNote: z.string().max(2000).nullable().optional(),
    ownerLimit: z.number().int().min(1).max(1000).nullable().optional(),
    adminLimit: z.number().int().min(1).max(1000).nullable().optional(),
    ownerTransferProcedure: z.string().max(2000).nullable().optional(),
    emergencyAccount: emergencyAccount.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 1, { message: 'Name at least one field of the workspace to change.' })
  .meta({ minProperties: 2, description: 'The version of the workspace and at least one field to change.' });

export const setWorkspaceAdminsBodySchema = z.strictObject({
  admins: z
    .array(z.strictObject({ employeeId: z.uuid(), role }))
    .min(1)
    .max(WORKSPACE_ADMINS_MAX)
    .refine((admins) => new Set(admins.map((admin) => admin.employeeId)).size === admins.length, {
      message: 'A person is named once.',
    }),
  primaryOwnerEmployeeId: z
    .uuid()
    .meta({ description: 'The primary owner: one of the administrators, with the role OWNER.' }),
  expectedUpdatedAt: version,
});

export const changeWorkspaceResponsibleBodySchema = z.strictObject({
  employeeId: z.uuid().meta({ description: 'The IT Admin who is to answer for the workspace; one who works now.' }),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .meta({ description: 'Why the IT Admin in charge changes (1 to 500 characters).' }),
});

const person = z.strictObject({ employeeId: z.uuid(), name: z.string() });
const workspaceSummarySchema = z.strictObject({
  id: z.uuid(),
  vendor: z.strictObject({ id: z.uuid(), name: z.string() }),
  name: z.string(),
  adminCount: z.number().int().nonnegative(),
  workingAdminCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: 'The administrators who are IT Admins that work now.' }),
  flags: z.array(flag).max(WORKSPACE_FLAGS_MAX),
  responsibleItAdmin: person.nullable(),
  subscriptionCount: z.number().int().nonnegative(),
});
const workspaceDetailSchema = workspaceSummarySchema.extend({
  admins: z
    .array(person.extend({ role, flags: z.array(adminFlag).max(WORKSPACE_ADMIN_FLAGS_MAX) }))
    .max(WORKSPACE_ADMINS_MAX),
  primaryOwner: person.nullable(),
  ownerAccountEmail: z.string().nullable(),
  ownerLimit: z.number().int().nullable(),
  adminLimit: z.number().int().nullable(),
  ownerTransferProcedure: z.string().nullable(),
  emergencyAccount: z
    .strictObject({
      identity: z.string(),
      occupiesSeat: z.boolean(),
      holder: person,
      lastReviewedOn: z.string(),
    })
    .nullable(),
  adminNote: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
const workspaceChangeSchema = workspaceDetailSchema.extend({
  changed: z
    .boolean()
    .meta({ description: 'False when the IT Admin named already answered for the workspace and nothing was written.' }),
});

export class WorkspaceIdParamDto extends createZodDto(workspaceIdParamSchema) {}
export class ListWorkspacesQueryDto extends createZodDto(listWorkspacesQuerySchema) {}
export class CreateWorkspaceBodyDto extends createZodDto(createWorkspaceBodySchema) {}
export class UpdateWorkspaceBodyDto extends createZodDto(updateWorkspaceBodySchema) {}
export class SetWorkspaceAdminsBodyDto extends createZodDto(setWorkspaceAdminsBodySchema) {}
export class ChangeWorkspaceResponsibleBodyDto extends createZodDto(changeWorkspaceResponsibleBodySchema) {}
export class WorkspaceDetailResponseDto extends createZodDto(successEnvelopeSchema(workspaceDetailSchema)) {}
export class WorkspaceChangeResponseDto extends createZodDto(successEnvelopeSchema(workspaceChangeSchema)) {}
export class WorkspacePageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(workspaceSummarySchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
