import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { assignmentSchema } from '../assignment/assignment.dto';

/**
 * The flag on needs the reason the seat is a machine account (one to 500 characters once trimmed); the flag off needs nothing, and a note
 * given with it is not kept. Whether the person holds the seat as an IT Admin and whether the seat is open is judged by the policy, which
 * answers with its own `LICENSE_ASSIGNMENT.*` code.
 */
export const machineAccountBodySchema = z
  .strictObject({
    isMachineAccount: z.boolean(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((body, context) => {
    if (body.isMachineAccount && body.note === undefined) {
      context.addIssue({ code: 'custom', path: ['note'], message: 'Give the reason the seat is a machine account.' });
    }
  });

export class MachineAccountBodyDto extends createZodDto(machineAccountBodySchema) {}
export class MachineAccountResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ assignment: assignmentSchema })),
) {}
