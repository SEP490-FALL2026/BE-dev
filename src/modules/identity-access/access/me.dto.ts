import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

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
  roles: z.strictObject({
    direct: z.array(z.string()),
    derived: z.array(z.string()),
    effective: z.array(z.string()),
  }),
  /** True when the account holds no role at all: it can only use self-service routes. */
  selfServiceOnly: z.boolean(),
});

export class MeResponseDto extends createZodDto(successEnvelopeSchema(meSchema)) {}
