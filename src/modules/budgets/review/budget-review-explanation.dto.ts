import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
/** An amount the head types: in the reporting currency of the organization, which the client never names. */
const amountInput = z.strictObject({ amount: z.string().max(40) });
const person = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

export const explanationStatusSchema = z.enum(['NOT_REQUIRED', 'PENDING', 'EXPLAINED', 'UNEXPLAINED', 'NO_HEAD']).meta({
  description:
    'NOT_REQUIRED: a month, or a Cost Center that is green, is not asked. PENDING: asked and waiting for the head of the department. EXPLAINED: the head explained. UNEXPLAINED: Finance signed the quarter before the head explained. NO_HEAD: Finance signed and the department had no head to ask (not held against it).',
});

/** What the head of a department explained of a Cost Center in a quarterly review. */
export const explanationViewSchema = z.strictObject({
  cause: z.string(),
  persistence: z
    .enum(['ONE_OFF', 'ONGOING'])
    .meta({ description: 'ONE_OFF: it happened once. ONGOING: it goes on and will weigh on the months to come.' }),
  action: z.string().meta({ description: 'What the department does about it.' }),
  knownNeedsToYearEnd: z.strictObject({
    amount: moneyView.nullable().meta({
      description:
        'What the department already knows it will need to the end of the year (nothing is 0); null only on an explanation written before the amount was asked for.',
    }),
    note: z.string(),
  }),
  explainedBy: person.nullable(),
  explainedAt: z.iso.datetime(),
});

export const explainLineParamSchema = z.strictObject({
  id: z.uuid().meta({ description: 'The id of the review period.' }),
  costCenterId: z.uuid().meta({ description: 'The Cost Center the head explains.' }),
});

export const explainLineBodySchema = z.strictObject({
  cause: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .meta({ description: 'Why the Cost Center is yellow, red or under what it should have used.' }),
  persistence: z.enum(['ONE_OFF', 'ONGOING']).meta({ description: 'Whether the cause happened once or goes on.' }),
  action: z.string().trim().min(1).max(2000).meta({ description: 'What the department does about it.' }),
  knownNeedsToYearEnd: z
    .strictObject({
      amount: amountInput.meta({
        description:
          'What the department already knows it will need to the end of the year, in the reporting currency: required, and 0 when it knows of no need.',
      }),
      note: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .meta({ description: 'What is known of the need to the end of the year, in words.' }),
    })
    .meta({ description: 'What the department already knows it will need to the end of the year.' }),
});

const explainedLineSchema = z.strictObject({
  periodId: z.uuid(),
  costCenterId: z.uuid(),
  explanationStatus: explanationStatusSchema,
  explanation: explanationViewSchema.nullable(),
});

export class ExplainLineParamDto extends createZodDto(explainLineParamSchema) {}
export class ExplainLineBodyDto extends createZodDto(explainLineBodySchema) {}
export class ExplainedLineResponseDto extends createZodDto(successEnvelopeSchema(explainedLineSchema)) {}

export type ExplanationView = z.infer<typeof explanationViewSchema>;
export type ExplainedLineWire = z.infer<typeof explainedLineSchema>;
