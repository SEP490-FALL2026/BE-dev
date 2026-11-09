import { z } from 'zod';
import { jsonColumn, nullableJsonColumn } from '../../../infrastructure/database/json-column';
import {
  SOURCE_REF_PATTERN,
  STEP_KINDS,
  type QueueContext,
  type QueueSummaryParsed,
  queueContextSchema,
  queueSummaryParsedSchema,
} from '../ai-service/ai-service.types';

/*
 * The three JSON columns of `ai_invocation_contents` for the summary of a queue (`US-15-05`): the context sent to the AI service and
 * the lines it parsed are the shapes of contract v1 (`ai-service.types.ts`); the result is what the checks of the backend kept. Each
 * is written in exactly the shape it is read in.
 */

/** `ai_invocation_contents.context`: always present, the allow-listed context with opaque references in place of ids. */
export const aiInvocationContextJson = jsonColumn({
  table: 'ai_invocation_contents',
  column: 'context',
  schema: queueContextSchema,
  encode: (value: QueueContext) => value,
});

/** `ai_invocation_contents.parsed`: NULL until the AI service answers, and when it could not parse its own output. */
export const aiInvocationParsedJson = nullableJsonColumn({
  table: 'ai_invocation_contents',
  column: 'parsed',
  schema: queueSummaryParsedSchema,
  encode: (value: QueueSummaryParsed) => value,
});

const sourceRef = z.string().regex(SOURCE_REF_PATTERN);

/**
 * What the checks of the backend kept of an answer: how many steps waited when the summary was composed, the step and request each
 * reference stood for (real ids stay in the backend), the lines that passed with the cost written in, and why each other line was
 * rejected.
 */
const resultSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  steps: z.array(
    z.strictObject({
      sourceRef,
      stepId: z.string().min(1),
      requestId: z.string().min(1),
      stepKind: z.enum(STEP_KINDS),
    }),
  ),
  accepted: z.array(z.strictObject({ sourceRef, summary: z.string() })),
  rejections: z.array(z.strictObject({ sourceRef, code: z.string().regex(/^[A-Z][A-Z_]*$/) })),
});
export type InvocationResult = z.output<typeof resultSchema>;

/** `ai_invocation_contents.result`: NULL until the checks of the backend have run. */
export const aiInvocationResultJson = nullableJsonColumn({
  table: 'ai_invocation_contents',
  column: 'result',
  schema: resultSchema,
  encode: (value: InvocationResult) => value,
});
