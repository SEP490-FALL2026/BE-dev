import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const departmentMemberParamSchema = z.strictObject({ id: z.uuid(), employeeId: z.uuid() });

/** The two subresources are pages of 100 at most: the number of rights or requests of one person has no business maximum. */
const pageQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** One person of the department as its head reads them (`QĐ-41c`(2)): no work email, contract type, work state or end of employment. */
const memberSchema = z.strictObject({
  employeeId: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  /** The stored value as it is: `ACTIVE` or `TERMINATED`. */
  status: z.enum(['ACTIVE', 'TERMINATED']),
  /** Whether the person has a work email, never the address. */
  hasWorkEmail: z.boolean(),
  /** The first day of the person's current period in the department. */
  memberSince: responseBusinessDate,
  /** How many seats the person holds today; the seats are in `software-rights`. */
  heldSoftwareCount: z.number().int().nonnegative(),
  /** How many requests of the person that were sent from this department are not over; the requests are in `open-requests`. */
  openRequestCount: z.number().int().nonnegative(),
});

/** A seat the person holds today, by the name of the software and its plan: no price, key, account identifier or reason of the grant. */
const softwareRightSchema = z.strictObject({
  assignmentId: z.uuid(),
  applicationName: z.string(),
  planName: z.string(),
  grantedOn: responseBusinessDate,
  endsOn: responseBusinessDate.nullable(),
});

/** A request of the person that was sent from this department and is not over: no requester, amount or reason. */
const openRequestSchema = z.strictObject({
  requestId: z.uuid(),
  type: z.enum(['GRANT', 'SERVICE_ACCOUNT', 'RENEWAL', 'GROUP_GRANT']),
  state: z.string(),
  /** The software asked for; null while it is not in the catalog yet. */
  applicationName: z.string().nullable(),
  planName: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  /** The request is for a group of people: only the line of this person is open here. */
  group: z.boolean(),
});

export type DepartmentMemberWire = z.infer<typeof memberSchema>;
export type DepartmentMemberSoftwareRightWire = z.infer<typeof softwareRightSchema>;
export type DepartmentMemberOpenRequestWire = z.infer<typeof openRequestSchema>;

export class DepartmentMemberParamDto extends createZodDto(departmentMemberParamSchema) {}
export class DepartmentMemberPageQueryDto extends createZodDto(pageQuerySchema) {}
export class DepartmentMemberResponseDto extends createZodDto(successEnvelopeSchema(memberSchema)) {}
export class DepartmentMemberSoftwareRightPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(softwareRightSchema), pagination })),
) {}
export class DepartmentMemberOpenRequestPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(openRequestSchema), pagination })),
) {}
