import type { AiProviderMode, QueueContext, QueueSummaryParsed } from '../ai-service/ai-service.types';
import type { InvocationResult } from './invocation-content.json';

/** The features of the AI that record their calls; the finance narrative (`US-15-06`) is not one yet. */
export type AiFeature = 'ACCESS_REQUEST_QUEUE_SUMMARY';

/**
 * PENDING and RUNNING are live; the others are final. STALE is written only by the purge, to a COMPLETED call whose content it
 * deletes.
 */
export type InvocationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'NO_VALID_OUTPUT' | 'STALE' | 'FAILED';

/** The status of the one call kept for a queue revision (the partial unique index `ai_invocations_active_per_revision`). */
export type LiveInvocation = { id: string; status: 'PENDING' | 'RUNNING' | 'COMPLETED' };

/** Whose calls of which feature: the person by their account, in their organization. */
export interface InvocationOwner {
  organizationId: string;
  actorAppUserId: string;
  feature: AiFeature;
}

/** The calls of a person and feature made in one mode: one of them at most is kept for a queue revision. */
export interface InvocationKey extends InvocationOwner {
  providerMode: AiProviderMode;
}

/** A call taken for stuck, with the mode it was made in. */
export interface StuckInvocation {
  id: string;
  providerMode: AiProviderMode;
}

export interface NewInvocation extends InvocationKey {
  actorEmployeeId: string;
  sourceRevision: string;
  context: QueueContext;
  /** PENDING for a call that will run; FAILED for one recorded as it failed (its source could not be read). */
  status: 'PENDING' | 'FAILED';
  errorCode: string | null;
  at: Date;
}

/** A call as its owner reads it back: never the prompt, the answer or the context. */
export interface InvocationRecord extends InvocationKey {
  id: string;
  actorEmployeeId: string;
  status: InvocationStatus;
  sourceRevision: string;
  errorCode: string | null;
  createdAt: Date;
  startedAt: Date | null;
  result: InvocationResult | null;
}

/** What the AI service said about itself and the call; `configFingerprint` is stored as `config_hash`. */
export interface InvocationMetadata {
  modelId: string;
  modelRevision: string;
  promptVersion: string;
  schemaVersion: string;
  configFingerprint: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
}

/** How a run ended: its status and code, and what the AI service answered when it answered. */
export interface InvocationOutcome {
  status: 'COMPLETED' | 'NO_VALID_OUTPUT' | 'FAILED';
  errorCode: string | null;
  metadata: InvocationMetadata | null;
  content: {
    promptText: string;
    rawResponse: string;
    parsed: QueueSummaryParsed | null;
    result: InvocationResult | null;
  } | null;
}

/** What was said to the model and what came back for one call, as the Super Admin reads it; the fields the table lets be empty are null. */
export interface InvocationContentRecord {
  invocationId: string;
  organizationId: string;
  providerMode: AiProviderMode;
  context: QueueContext;
  promptText: string | null;
  rawResponse: string | null;
  parsed: QueueSummaryParsed | null;
  result: InvocationResult | null;
}
