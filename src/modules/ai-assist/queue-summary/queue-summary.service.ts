import { Injectable, Logger } from '@nestjs/common';
import { type DbTx, TransactionRunner, toTransientError } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestsAiSourceApi } from '../../requests/public/requests-ai-source.api';
import { AiServiceClients } from '../ai-service/ai-service-clients.service';
import { type AiProviderMode, QUEUE_MAX_REQUESTS } from '../ai-service/ai-service.types';
import { AiInvocationRepo } from '../invocation/invocation.repo';
import type { InvocationKey, InvocationRecord, LiveInvocation } from '../invocation/invocation.types';
import { summaryFailedEvent, summaryRequestedEvent } from './queue-summary-audit-event.mapper';
import { composeQueueContext, queueRevisionOf } from './queue-summary-context.policy';
import { QueueSummaryRunService, type QueueSummaryJob } from './queue-summary-run.service';
import { summaryView } from './queue-summary-view.policy';
import {
  AiDisabledError,
  AiProviderUnavailableError,
  NoAssignedStepsError,
  SummaryNotFoundError,
  SummarySourceStaleError,
} from './queue-summary.errors';
import {
  QUEUE_SUMMARY_FEATURE,
  RUN_STUCK_AFTER_MS,
  SUMMARY_ERROR_CODES,
  type QueueSummarySource,
  type QueueSummaryStatus,
  type QueueSummaryView,
} from './queue-summary.types';

/** The two switches that must both be ON: the switch of the AI and the switch of this feature. */
const SWITCHES = ['AI_ENABLED', 'AI_ACCESS_REQUEST_SUMMARY_ENABLED'] as const;
/** The operating parameter that says where the answers of a new call come from. */
const PROVIDER_MODE = 'AI_PROVIDER_MODE';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_INDEX = 'ai_invocations_active_per_revision';

/** What the transaction of `create` decided: a call to run, the call already kept for the revision, or a source that cannot be read. */
type Admission =
  { kind: 'admitted'; job: QueueSummaryJob } | { kind: 'kept'; live: LiveInvocation } | { kind: 'unreadable' };

const stuckBefore = (now: Date) => new Date(now.getTime() - RUN_STUCK_AFTER_MS);
const isLive = (record: InvocationRecord) => record.status === 'PENDING' || record.status === 'RUNNING';

/**
 * The AI summary of the approval steps that wait for a person (`US-15-05`), on demand only. `create` checks the switches and
 * the queue, records the call and starts it in the background; `get` gives the owner the summary read against the queue now.
 * Only the steps given to the caller are read, under their own employee id, so nobody else's step ever reaches the context (AC-3).
 */
@Injectable()
export class QueueSummaryService {
  private readonly logger = new Logger('AiQueueSummary');

  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AiInvocationRepo,
    private readonly source: RequestsAiSourceApi,
    private readonly parameters: OperatingParametersApi,
    private readonly organizations: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly clients: AiServiceClients,
    private readonly runs: QueueSummaryRunService,
  ) {}

  /**
   * Asks for a summary of the queue the person sees (`queueRevision`), in the mode `AI_PROVIDER_MODE` says now: the call keeps it
   * until it ends. Refuses with AiDisabledError (in either mode), AiProviderUnavailableError (MODEL with no AI service configured;
   * the simulation needs none), NoAssignedStepsError (the model is never called, AC-9) or SummarySourceStaleError; gives back the
   * call already kept for the same revision in the same mode, after taking the stuck runs of the person for FAILED. A source that
   * cannot be read is recorded as a FAILED call, never an error of the request.
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: { queueRevision: string },
  ): Promise<{ invocationId: string; status: QueueSummaryStatus }> {
    await this.requireSwitchedOn();
    const providerMode = await this.providerMode();
    if (!this.clients.forMode(providerMode).configured()) throw new AiProviderUnavailableError();
    const organizationId = await this.organizationId();
    const key: InvocationKey = {
      organizationId,
      actorAppUserId: actor.appUserId,
      feature: QUEUE_SUMMARY_FEATURE,
      providerMode,
    };
    let admission: Admission;
    try {
      admission = await this.runner.run((tx) => this.admit(tx, actor, key, input.queueRevision));
    } catch (error) {
      // Two requests for the same revision at once: the one that lost the unique index gives back the call of the other.
      const live = isUniqueViolation(error, UNIQUE_INDEX, 'source_revision')
        ? await this.repo.findLive({ ...key, sourceRevision: input.queueRevision })
        : null;
      if (live === null) throw error;
      admission = { kind: 'kept', live };
    }
    if (admission.kind === 'unreadable') return this.recordUnreadable(actor, key, input.queueRevision);
    if (admission.kind === 'kept') return { invocationId: admission.live.id, status: admission.live.status };
    this.runs.start(admission.job);

    return { invocationId: admission.job.invocationId, status: 'PENDING' };
  }

  /** The summary of the caller; AI.NOT_FOUND for one of anybody else. A run stuck for more than 150 seconds reads as FAILED. */
  async get(actor: AuthenticatedPrincipal, invocationId: string): Promise<QueueSummaryView> {
    if (!UUID.test(invocationId)) throw new SummaryNotFoundError();
    let record = await this.repo.findOwned(invocationId, actor.appUserId);
    if (record === null) throw new SummaryNotFoundError();
    const now = new Date();
    if (isLive(record) && (record.startedAt ?? record.createdAt).getTime() < stuckBefore(now).getTime()) {
      record = await this.expireOne(actor, record, now);
    }
    if (record.status !== 'COMPLETED' || record.result === null) return summaryView(record, null);
    const stepIds = record.result.steps.map((step) => step.stepId);
    // One transaction, one statement at a time: which steps are still theirs, then the revision of their queue now.
    const sourceNow = await this.runner.run(async (tx) => {
      const held = await this.source.stillHeldBy(actor.employeeId, stepIds, tx);

      return { held, currentRevision: await this.currentRevision(actor, tx, record.id) };
    });

    return summaryView(record, sourceNow);
  }

  /**
   * The queue of the caller as a summary would read it now: its revision (what `create` takes as `queueRevision`), how many steps it
   * would cover and how many it would leave out. The AI service is not called and nothing is written. Refuses with AiDisabledError
   * when a switch is OFF, before reading a step; a queue that cannot be read is an error, never a revision made up.
   */
  async readSource(actor: AuthenticatedPrincipal): Promise<QueueSummarySource> {
    await this.requireSwitchedOn();
    const source = await this.source.openStepsHeldBy(actor.employeeId, QUEUE_MAX_REQUESTS);
    const stepCount = Math.min(source.steps.length, QUEUE_MAX_REQUESTS);

    return {
      queueRevision: queueRevisionOf(source.steps, source.total),
      stepCount,
      omittedCount: Math.max(source.total - stepCount, 0),
    };
  }

  private async requireSwitchedOn(): Promise<void> {
    for (const key of SWITCHES) {
      if ((await this.parameters.getValue(key)) !== 'ON') throw new AiDisabledError();
    }
  }

  /**
   * MODEL only when the parameter says so; any other value means SIMULATED, the source that sends nothing out, and a value that is
   * not one of the two is told to the operator (by its kind, never what it holds).
   */
  private async providerMode(): Promise<AiProviderMode> {
    const value = await this.parameters.getValue(PROVIDER_MODE);
    if (value === 'MODEL' || value === 'SIMULATED') return value;
    this.logger.warn(
      `feature=${QUEUE_SUMMARY_FEATURE} ${PROVIDER_MODE} is not MODEL or SIMULATED (${typeof value}): SIMULATED is used`,
    );

    return 'SIMULATED';
  }

  private async organizationId(): Promise<string> {
    const organization = await this.organizations.getOrganization();
    if (organization === null) throw new Error('The AI summary was asked for before installation.');

    return organization.id;
  }

  /** In one transaction: the queue of the person, the checks, the stuck runs, the call kept for the revision, or a new call. */
  private async admit(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    key: InvocationKey,
    queueRevision: string,
  ): Promise<Admission> {
    let source: Awaited<ReturnType<RequestsAiSourceApi['openStepsHeldBy']>>;
    try {
      source = await this.source.openStepsHeldBy(actor.employeeId, QUEUE_MAX_REQUESTS, tx);
    } catch (error) {
      // A database unavailable for a while is answered as such; a step that points at a missing record is broken data.
      if (toTransientError(error) !== undefined) throw error;
      this.logSourceFailure('compose', error);

      return { kind: 'unreadable' };
    }
    if (source.total === 0) throw new NoAssignedStepsError();
    if (queueRevisionOf(source.steps, source.total) !== queueRevision) throw new SummarySourceStaleError();
    const now = new Date();
    await this.expireStuck(tx, actor, key, now);
    const live = await this.repo.findLive({ ...key, sourceRevision: queueRevision }, tx);
    if (live !== null) return { kind: 'kept', live };
    const composed = composeQueueContext(source.steps, source.total, now);
    const { id } = await this.repo.insert(tx, {
      ...key,
      actorEmployeeId: actor.employeeId,
      sourceRevision: queueRevision,
      context: composed.context,
      status: 'PENDING',
      errorCode: null,
      at: now,
    });
    await this.audit.record(
      tx,
      summaryRequestedEvent(actor, key.organizationId, id, {
        queueRevision,
        providerMode: key.providerMode,
        stepCount: composed.lines.length,
        omittedCount: composed.omittedCount,
      }),
    );
    const job = {
      invocationId: id,
      organizationId: key.organizationId,
      actor,
      context: composed.context,
      lines: composed.lines,
      total: source.total,
      providerMode: key.providerMode,
    };

    return { kind: 'admitted', job };
  }

  /**
   * Takes every live call of the person older than 150 seconds for FAILED (`AI.PROVIDER_TIMEOUT`), in every mode, each with its audit
   * event in the mode of that call (not the mode of the request that found it).
   */
  private async expireStuck(tx: DbTx, actor: AuthenticatedPrincipal, key: InvocationKey, now: Date): Promise<void> {
    for (const { id, providerMode } of await this.repo.stuckOf(tx, key, stuckBefore(now))) {
      if (await this.repo.expire(tx, id, stuckBefore(now), now)) {
        await this.audit.record(
          tx,
          summaryFailedEvent(actor, key.organizationId, id, {
            errorCode: SUMMARY_ERROR_CODES.PROVIDER_TIMEOUT,
            providerMode,
          }),
        );
      }
    }
  }

  private async expireOne(
    actor: AuthenticatedPrincipal,
    record: InvocationRecord,
    now: Date,
  ): Promise<InvocationRecord> {
    await this.runner.run(async (tx) => {
      if (await this.repo.expire(tx, record.id, stuckBefore(now), now)) {
        await this.audit.record(
          tx,
          summaryFailedEvent(actor, record.organizationId, record.id, {
            errorCode: SUMMARY_ERROR_CODES.PROVIDER_TIMEOUT,
            providerMode: record.providerMode,
          }),
        );
      }
    });

    return (await this.repo.findOwned(record.id, actor.appUserId)) ?? record;
  }

  /** The revision of the queue of the person now; null when it cannot be read (a broken step), which reads as changed. */
  private async currentRevision(actor: AuthenticatedPrincipal, tx: DbTx, invocationId: string): Promise<string | null> {
    try {
      const source = await this.source.openStepsHeldBy(actor.employeeId, QUEUE_MAX_REQUESTS, tx);

      return queueRevisionOf(source.steps, source.total);
    } catch (error) {
      if (toTransientError(error) !== undefined) throw error;
      this.logSourceFailure(`read again for invocation=${invocationId}`, error);

      return null;
    }
  }

  /** The kind of error that made the queue unreadable, for the operator: never its message, a step or what it holds. */
  private logSourceFailure(stage: string, error: unknown): void {
    this.logger.error(
      `feature=${QUEUE_SUMMARY_FEATURE} source ${stage} failed: ${describeForOperator(error)}`,
      traceForOperator(error),
    );
  }

  /** A call whose context could not be composed: recorded FAILED with `AI.SOURCE_UNREADABLE`, nothing sent to the model. */
  private async recordUnreadable(
    actor: AuthenticatedPrincipal,
    key: InvocationKey,
    queueRevision: string,
  ): Promise<{ invocationId: string; status: QueueSummaryStatus }> {
    const now = new Date();
    const id = await this.runner.run(async (tx) => {
      const { id: invocationId } = await this.repo.insert(tx, {
        ...key,
        actorEmployeeId: actor.employeeId,
        sourceRevision: queueRevision,
        context: { generatedAt: now.toISOString(), requests: [] },
        status: 'FAILED',
        errorCode: SUMMARY_ERROR_CODES.SOURCE_UNREADABLE,
        at: now,
      });
      await this.audit.record(
        tx,
        summaryRequestedEvent(actor, key.organizationId, invocationId, {
          queueRevision,
          providerMode: key.providerMode,
          stepCount: 0,
          omittedCount: 0,
        }),
      );
      await this.audit.record(
        tx,
        summaryFailedEvent(actor, key.organizationId, invocationId, {
          errorCode: SUMMARY_ERROR_CODES.SOURCE_UNREADABLE,
          providerMode: key.providerMode,
        }),
      );

      return invocationId;
    });

    return { invocationId: id, status: 'FAILED' };
  }
}
