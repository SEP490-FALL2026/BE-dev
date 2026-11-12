import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const responsibilityTransferBodySchema = z.strictObject({ toItAdminEmployeeId: z.uuid() });
export const responsibilityTransferParamSchema = z.strictObject({ id: z.uuid() });

export class ResponsibilityTransferBodyDto extends createZodDto(responsibilityTransferBodySchema) {}
export class ResponsibilityTransferParamDto extends createZodDto(responsibilityTransferParamSchema) {}
export class ResponsibilityTransferResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      applicationId: z.uuid(),
      responsibleItAdmin: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
      changed: z.boolean().meta({
        description: 'False when the application was handed to the one already responsible: nothing was written.',
      }),
    }),
  ),
) {}
