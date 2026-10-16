import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const approvalRole = z.enum(['SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER']);

export const approvalRoleParamSchema = z.strictObject({ role: approvalRole });
export const setApprovalRoleBodySchema = z.strictObject({ employeeId: z.uuid() });

const person = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

const approvalRolesSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      role: approvalRole,
      holder: person.extend({ since: z.iso.datetime() }).nullable(),
      history: z.array(person.extend({ from: z.iso.datetime(), until: z.iso.datetime().nullable() })),
    }),
  ),
});

export class ApprovalRoleParamDto extends createZodDto(approvalRoleParamSchema) {}
export class SetApprovalRoleBodyDto extends createZodDto(setApprovalRoleBodySchema) {}
export class ApprovalRolesResponseDto extends createZodDto(successEnvelopeSchema(approvalRolesSchema)) {}
