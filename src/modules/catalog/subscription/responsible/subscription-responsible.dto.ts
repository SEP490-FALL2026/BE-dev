import { z } from 'zod';
import { createZodDto } from '../../../../infrastructure/http/dto/zod-dto';

export const changeResponsibleBodySchema = z.strictObject({
  employeeId: z.uuid().meta({ description: 'The IT Admin who is to answer for the subscription; one who works now.' }),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .meta({ description: 'Why the IT Admin in charge changes (1 to 500 characters).' }),
});

export class ChangeResponsibleBodyDto extends createZodDto(changeResponsibleBodySchema) {}
