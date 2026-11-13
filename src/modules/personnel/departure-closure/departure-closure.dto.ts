import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** The words of the IT Admin about the lock of the mailbox, if any: when given they are not blank. */
const mailboxLockBodySchema = z.strictObject({ note: z.string().trim().min(1).max(1000).optional() });

export class RecordMailboxLockBodyDto extends createZodDto(mailboxLockBodySchema) {}
