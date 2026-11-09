import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { AuditApi } from '../../audit/public/audit.api';
import { RequestsAiSourceApi } from '../../requests/public/requests-ai-source.api';
import {
  AiServiceAnswerInvalidError,
  AiServiceNotConfiguredError,
  AiServiceTimeoutError,
  AiServiceUnavailableError,
} from '../ai-service/ai-service.errors';
import {
  AI_CONTRACT_VERSION,
  AiServiceClient,
  type QueueContext,
  type QueueSummaryServiceResponse,
} from '../ai-service/ai-service.types';
import { AiInvocationRepo } from '../invocation/invocation.repo';
import type { InvocationMetadata, InvocationOutcome } from '../invocation/invocation.types';
import { type SummaryActor, summaryEndedEvent } from './queue-summary-audit-event.mapper';
import type { ContextLine } from './queue-summary-context.policy';
import { OUTPUT_CHECK_VERSION, renderCost, validateQueueSummary } from './queue-summary-output.policy';
import { QUEUE_SUMMARY_FEATURE, SUMMARY_ERROR_CODES } from './queue-summary.types';

/** A call recorded PENDING, with what the run needs: the context sent and what each of its references stands for. */
export interface QueueSummaryJob {
  invocationId: string;
  organizationId: string;
  actor: SummaryActor & { employeeId: string };
  context: QueueContext;
  lines: ContextLine[];
  /** How many steps waited for the person when the summary was composed. */
  total: number;
}

/** The fingerprint of what shaped an answer: the model, the prompt, the output schema and the checks of the backend. */
function configFingerprintOf(answer: QueueSummaryServiceResponse): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        answer.modelId,
        answer.modelRevision,
        answer.promptVersion,
        answer.schemaVersion,
        OUTPUT_CHECK_VERSION,
      ]),
    )
    .digest('hex');
}

function metadataOf(answer: QueueSummaryServiceResponse): InvocationMetadata {
  return {
    modelId: answer.modelId,
    modelRevision: answer.modelRevision,
    promptVersion: answer.promptVersion,
    schemaVersion: answer.schemaVersion,
    configFingerprint: configFingerprintOf(answer),
    latencyMs: answer.latencyMs,
    promptTokens: answer.usage.promptTokens,
    completionTokens: answer.usage.completionTokens,
  };
}

/** The code of a call the AI service did not answer as the contract says; null for an error nobody expected. */
function failureCodeOf(error: unknown): string | null {
  if (error instanceof AiServiceTimeoutError) return SUMMARY_ERROR_CODES.PROVIDER_TIMEOUT;
  if (error instanceof AiServiceUnavailableError || error instanceof AiServiceNotConfiguredError) {
    return SUMMARY_ERROR_CODES.PROVIDER_UNAVAILABLE;
  }
  if (error instanceof AiServiceAnswerInvalidError) return SUMMARY_ERROR_CODES.OUTPUT_INVALID;

  return null;
}

const failed = (errorCode: string, metadata: InvocationMetadata | null = null): InvocationOutcome => ({
  status: 'FAILED',
  errorCode,
  metadata,
  content: null,
});

/**
 * Runs a recorded call in the background of the API: RUNNING, the AI service, the checks of the answer, the source read again,
 * then COMPLETED, NO_VALID_OUTPUT or FAILED with the audit event, in one transaction. A failure of any kind ends as a state with a
 * stable code, never as an error of the request that started it; the log names the call, the feature, the status, the time and the
 * code, never what was said. A run that cannot even record its end stays RUNNING until a request of its owner takes it for
 * stuck.
 */
@Injectable()
export class QueueSummaryRunService implements OnModuleDestroy {
  private readonly logger = new Logger('AiQueueSummary');
  private readonly running = new Set<Promise<void>>();
  /** Aborted when the module stops, so a call under way ends and records itself instead of holding the shutdown. */
  private readonly stopping = new AbortController();

  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AiInvocationRepo,
    private readonly source: RequestsAiSourceApi,
    private readonly audit: AuditApi,
    private readonly client: AiServiceClient,
  ) {}

  /** Starts the run and returns at once: the caller has already answered the person. */
  start(job: QueueSummaryJob): void {
    const run = this.run(job)
      .catch((error: unknown) => this.logFailure(job, 'record', error))
      .finally(() => this.running.delete(run));
    this.running.add(run);
  }

  /** Resolves when every run started so far has ended. */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.running]);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping.abort();
    await this.idle();
  }

  private async run(job: QueueSummaryJob): Promise<void> {
    if (!(await this.repo.markRunning(job.invocationId, new Date()))) return;
    let outcome: InvocationOutcome;
    try {
      outcome = await this.outcomeOf(job);
    } catch (error) {
      this.logFailure(job, 'run', error);
      outcome = failed(SUMMARY_ERROR_CODES.INTERNAL_ERROR);
    }
    await this.finish(job, outcome);
  }

  private async outcomeOf(job: QueueSummaryJob): Promise<InvocationOutcome> {
    let answer: QueueSummaryServiceResponse;
    try {
      answer = await this.client.summarizeQueue(
        { contractVersion: AI_CONTRACT_VERSION, invocationId: job.invocationId, locale: 'vi', context: job.context },
        this.stopping.signal,
      );
    } catch (error) {
      const code = failureCodeOf(error);
      if (code === null) throw error;

      return failed(code);
    }
    const metadata = metadataOf(answer);
    const content = {
      promptText: answer.promptText,
      rawResponse: answer.rawResponse,
      parsed: answer.parsed,
      result: null,
    };
    if (answer.parseStatus !== 'OK' || answer.parsed === null) {
      return { ...failed(SUMMARY_ERROR_CODES.OUTPUT_INVALID, metadata), content };
    }

    return this.checked(job, answer.parsed, metadata, content);
  }

  /** The answer through the checks, the costs written in, and the source read again: the lines still the person's decide the status. */
  private async checked(
    job: QueueSummaryJob,
    parsed: NonNullable<QueueSummaryServiceResponse['parsed']>,
    metadata: InvocationMetadata,
    content: NonNullable<InvocationOutcome['content']>,
  ): Promise<InvocationOutcome> {
    const validation = validateQueueSummary(job.context, parsed);
    const lines = new Map(job.lines.map((line) => [line.sourceRef, line]));
    const accepted = validation.accepted.map((item) => {
      const line = lines.get(item.sourceRef);

      return {
        sourceRef: item.sourceRef,
        summary: renderCost(item.summary, line?.costRef ?? null, line?.cost ?? null),
      };
    });
    const held = await this.source.stillHeldBy(
      job.actor.employeeId,
      job.lines.map((line) => line.stepId),
    );
    const shown = accepted.filter((item) => held.has(lines.get(item.sourceRef)?.stepId ?? ''));
    const result = {
      total: job.total,
      steps: job.lines.map(({ sourceRef, stepId, requestId, stepKind }) => ({
        sourceRef,
        stepId,
        requestId,
        stepKind,
      })),
      accepted,
      rejections: validation.rejections,
    };

    return {
      status: shown.length > 0 ? 'COMPLETED' : 'NO_VALID_OUTPUT',
      errorCode: shown.length > 0 ? null : SUMMARY_ERROR_CODES.NO_VALID_OUTPUT,
      metadata,
      content: { ...content, result },
    };
  }

  private async finish(job: QueueSummaryJob, outcome: InvocationOutcome): Promise<void> {
    const result = outcome.content?.result ?? null;
    const recorded = await this.runner.run(async (tx) => {
      if (!(await this.repo.finish(tx, job.invocationId, outcome, new Date()))) return false;
      await this.audit.record(
        tx,
        summaryEndedEvent(job.actor, job.organizationId, job.invocationId, {
          status: outcome.status,
          errorCode: outcome.errorCode,
          metadata: outcome.metadata,
          acceptedCount: result?.accepted.length ?? 0,
          rejectedCount: new Set(result?.rejections.map((rejection) => rejection.sourceRef)).size,
        }),
      );

      return true;
    });
    const latency = outcome.metadata === null ? '' : ` latencyMs=${outcome.metadata.latencyMs}`;
    this.logger.log(
      `invocation=${job.invocationId} feature=${QUEUE_SUMMARY_FEATURE} status=${recorded ? outcome.status : 'SUPERSEDED'}` +
        `${latency} errorCode=${outcome.errorCode ?? 'none'}`,
    );
  }

  private logFailure(job: QueueSummaryJob, stage: 'run' | 'record', error: unknown): void {
    this.logger.error(
      `invocation=${job.invocationId} feature=${QUEUE_SUMMARY_FEATURE} ${stage} failed: ${describeForOperator(error)}`,
      traceForOperator(error),
    );
  }
}
