import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { AI_PROVIDER_MODES } from '../ai-service/ai-service.types';

export const invocationContentParamSchema = z.strictObject({ invocationId: z.uuid() });

/**
 * `context`, `parsed` and `result` are JSON objects of the stored record, documented as free objects (as the `before` and `after` of
 * the Audit Trail are): their shape is the one of the AI service contract and of the checks of the backend, and the reader is a person
 * of the support, not a client that builds on it. They are not listed here, so no array of them is part of this contract.
 */
const contentSchema = z.strictObject({
  invocationId: z.uuid(),
  providerMode: z.enum(AI_PROVIDER_MODES).meta({
    description:
      "Where the answer came from: MODEL, the AI service; SIMULATED, the simulation that calls no model (show the label 'Giả lập — không phải AI').",
  }),
  context: z.record(z.string(), z.unknown()).meta({
    description:
      'The allow-listed context sent to the AI service, with opaque references (R001, C001) in place of ids. A JSON object.',
  }),
  promptText: z
    .string()
    .nullable()
    .meta({ description: 'The prompt that was sent to the model; null while the call has not been answered.' }),
  rawResponse: z
    .string()
    .nullable()
    .meta({ description: 'What the model answered, as it came; null while the call has not been answered.' }),
  parsed: z.record(z.string(), z.unknown()).nullable().meta({
    description:
      'The output of the AI service as it parsed it, a JSON object; null when it did not answer or could not parse it.',
  }),
  result: z.record(z.string(), z.unknown()).nullable().meta({
    description:
      'What the checks of the backend kept: the steps behind each reference, the lines that passed and why each other line was rejected, a JSON object; null until the checks have run.',
  }),
});

export class InvocationContentParamDto extends createZodDto(invocationContentParamSchema) {}
export class InvocationContentResponseDto extends createZodDto(successEnvelopeSchema(contentSchema)) {}
