import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The body of closing a request because its beneficiary left. `cause` says why and is the one cause there is; `note` is what the IT Admin
 * keeps with the closing; `evidence` is what they did to undo a grant that is being worked (took the invitation back, stopped the work),
 * needed only for such a task.
 */
export const cancelBodySchema = z.strictObject({
  cause: z.enum(['BENEFICIARY_LEFT']),
  note: z.string().trim().min(1).max(1000).optional(),
  evidence: z.string().trim().min(1).max(1000).optional(),
});

export class CancelBodyDto extends createZodDto(cancelBodySchema) {}
