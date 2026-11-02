import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { appRoleSchema } from '../accounts/account-management.dto';

export const meSchema = z.strictObject({
  appUserId: z.uuid(),
  loginEmail: z.string(),
  employee: z.strictObject({
    id: z.uuid(),
    employeeCode: z.string(),
    fullName: z.string(),
    department: z.strictObject({ code: z.string(), name: z.string() }).nullable(),
    jobTitle: z.string().nullable(),
  }),
  /** The roles granted to the account and still in force, sorted; MANAGER and SPENDING_APPROVER are granted like the others (US-01-01 AC-17). */
  roles: z.array(appRoleSchema),
  /**
   * The department the caller heads today, when they hold MANAGER; otherwise null. The Manager screens need both: `roles` has MANAGER
   * and `managerScope` is not null. A MANAGER who heads nothing today has the role and no scope, and the Manager routes refuse them.
   */
  managerScope: z
    .strictObject({ departmentId: z.uuid(), departmentCode: z.string(), departmentName: z.string() })
    .nullable(),
  /** True when `roles` is empty: the account can only use self-service routes. */
  selfServiceOnly: z.boolean(),
});

export class MeResponseDto extends createZodDto(successEnvelopeSchema(meSchema)) {}
