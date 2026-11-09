import { z } from 'zod';

/**
 * Version 1 of the contract between the backend and the AI service (`AI-dev/src/ai_service/contract.py`, design section 4): what the
 * backend sends to summarise the queue of a person and what the service answers. The schemas below are the one place its shape is
 * written on this side; the service checks the same limits on its side.
 */
export const AI_CONTRACT_VERSION = '1';

/** The most steps one summary sends: the rest of the queue is only counted. */
export const QUEUE_MAX_REQUESTS = 20;

/** The longest text of each field, in characters (code points, as the service counts them). */
export const QUEUE_TEXT_LIMITS = {
  softwareName: 120,
  beneficiaryDisplayName: 120,
  reason: 1000,
  requestedDurationLabel: 60,
  summary: 400,
} as const;

export const STEP_KINDS = ['NEED_APPROVAL', 'SPEND_APPROVAL'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** Whether the service could read the output of the model as the schema it asked for. */
export const PARSE_STATUSES = ['OK', 'INVALID_JSON', 'SCHEMA_MISMATCH'] as const;

/** The codes the service answers an error with (`ErrorCode` of the contract); any other text is not kept. */
export const SERVICE_ERROR_CODES = [
  'CONTEXT_INVALID',
  'CONTRACT_VERSION_MISMATCH',
  'CONTEXT_TOO_LARGE',
  'BUSY',
  'MODEL_LOADING',
  'MODEL_ERROR',
  'MODEL_TIMEOUT',
  'UNAUTHORIZED',
] as const;

/** An opaque reference to a step of the context (`R001`) and to the cost of one (`C001`): no real id leaves the backend. */
export const SOURCE_REF_PATTERN = /^R[0-9]{3}$/;
export const COST_REF_PATTERN = /^C[0-9]{3}$/;

const atMost = (limit: number) =>
  z.string().refine((value) => [...value].length <= limit, { message: `at most ${limit} characters` });
const sourceRef = z.string().regex(SOURCE_REF_PATTERN);
const stepKind = z.enum(STEP_KINDS);

export const queueRequestItemSchema = z.strictObject({
  sourceRef,
  stepKind,
  softwareName: atMost(QUEUE_TEXT_LIMITS.softwareName),
  beneficiaryDisplayName: atMost(QUEUE_TEXT_LIMITS.beneficiaryDisplayName),
  reason: atMost(QUEUE_TEXT_LIMITS.reason),
  requestedDurationLabel: atMost(QUEUE_TEXT_LIMITS.requestedDurationLabel).nullable(),
  estimatedCostRef: z.string().regex(COST_REF_PATTERN).nullable(),
});

/** What the model is told about the queue: the allow-listed fields of each step, nothing else. */
export const queueContextSchema = z.strictObject({
  generatedAt: z.iso.datetime(),
  requests: z.array(queueRequestItemSchema).max(QUEUE_MAX_REQUESTS),
});
export type QueueContext = z.output<typeof queueContextSchema>;
export type QueueRequestItem = z.output<typeof queueRequestItemSchema>;

export const summaryItemSchema = z.strictObject({
  sourceRef,
  stepKind,
  summary: atMost(QUEUE_TEXT_LIMITS.summary),
});

/** The lines the model wrote, as the service parsed them. */
export const queueSummaryParsedSchema = z.strictObject({ items: z.array(summaryItemSchema) });
export type SummaryItem = z.output<typeof summaryItemSchema>;
export type QueueSummaryParsed = z.output<typeof queueSummaryParsedSchema>;

export interface QueueSummaryServiceRequest {
  contractVersion: typeof AI_CONTRACT_VERSION;
  invocationId: string;
  locale: 'vi' | 'en';
  context: QueueContext;
}

const count = z.number().int().nonnegative();

/** The answer of `POST /v1/summaries/access-request-queue`: `parsed` holds the lines exactly when `parseStatus` is `OK`. */
export const queueSummaryServiceResponseSchema = z
  .strictObject({
    contractVersion: z.literal(AI_CONTRACT_VERSION),
    invocationId: z.string(),
    modelId: z.string(),
    modelRevision: z.string(),
    promptVersion: z.string(),
    schemaVersion: z.string(),
    promptText: z.string(),
    rawResponse: z.string(),
    parsed: queueSummaryParsedSchema.nullable(),
    parseStatus: z.enum(PARSE_STATUSES),
    usage: z.strictObject({ promptTokens: count, completionTokens: count }),
    latencyMs: count,
  })
  .refine((answer) => (answer.parseStatus === 'OK') === (answer.parsed !== null), {
    message: 'parsed is present exactly when parseStatus is OK',
  });
export type QueueSummaryServiceResponse = z.output<typeof queueSummaryServiceResponseSchema>;

/** Where the AI service is and how long one call may take; null when no AI service is configured. */
export interface AiServiceSettings {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The AI service as the summary calls it. It answers a call or throws one of `ai-service.errors.ts`; it never falls back to another
 * provider: a service that cannot answer means no summary.
 */
export abstract class AiServiceClient {
  /** False when no AI service is configured: the feature answers that it is unavailable and sends nothing. */
  abstract configured(): boolean;

  /** One summary of a queue; `signal` stops it early (the process stopping). */
  abstract summarizeQueue(
    request: QueueSummaryServiceRequest,
    signal: AbortSignal,
  ): Promise<QueueSummaryServiceResponse>;
}
