import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
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
    unplaced: z.boolean(),
    jobTitle: z.string().nullable(),
  }),
  /** The roles granted to the account and still in force, sorted; MANAGER and SPENDING_APPROVER are granted like the others (US-01-01 AC-17). */
  roles: z.array(appRoleSchema),
  /**
   * The department the caller heads today, when they hold MANAGER; otherwise null. The Manager screens need both: `roles` has MANAGER
   * and `managerScope` is not null. A MANAGER who heads nothing today has the role and no scope, and the Manager routes refuse them.
   * The one exception is the budget work (`BM-10`) of a department that starts later (`QĐ-106k`): the person holds the grant, the role is not
   * effective and `managerScope` is null, and the routes of the budget admit the grant and judge the unit (see `upcomingUnits`).
   */
  managerScope: z
    .strictObject({ departmentId: z.uuid(), departmentCode: z.string(), departmentName: z.string() })
    .nullable(),
  /**
   * The departments the caller is to head that have not taken effect yet (a department made for next year), each with the day it takes
   * effect and the Cost Center Finance made for it (null until then). The role MANAGER is not effective for them and `managerScope`
   * stays null, but they send and read the proposal of the next year (`BM-10`) for these units: the screen shows when this list is not empty.
   */
  upcomingUnits: z
    .array(
      z.strictObject({
        departmentId: z.uuid(),
        departmentCode: z.string(),
        departmentName: z.string(),
        effectiveFrom: responseBusinessDate,
        costCenterId: z.uuid().nullable(),
      }),
    )
    .max(5),
});

export class MeResponseDto extends createZodDto(successEnvelopeSchema(meSchema)) {}
