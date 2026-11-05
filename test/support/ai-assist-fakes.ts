import { randomUUID } from 'node:crypto';
import { Prisma } from '../../src/generated/prisma/client';
import type { DbTx, TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../src/modules/audit/public/audit.api';
import type { AuditEventInput } from '../../src/modules/audit/public/audit.types';
import { AiServiceClient } from '../../src/modules/ai-assist/ai-service/ai-service.types';
import type {
  QueueSummaryServiceRequest,
  QueueSummaryServiceResponse,
} from '../../src/modules/ai-assist/ai-service/ai-service.types';
import type { AiInvocationRepo } from '../../src/modules/ai-assist/invocation/invocation.repo';
import type {
  InvocationKey,
  InvocationOutcome,
  InvocationRecord,
  LiveInvocation,
  NewInvocation,
} from '../../src/modules/ai-assist/invocation/invocation.types';
import { QueueSummaryRunService } from '../../src/modules/ai-assist/queue-summary/queue-summary-run.service';
import { QueueSummaryService } from '../../src/modules/ai-assist/queue-summary/queue-summary.service';
import type { OperatingParametersApi } from '../../src/modules/operating-parameters/public/operating-parameters.api';
import type { OrganizationReadApi } from '../../src/modules/organization/public/organization-read.api';
import type { RequestsAiSourceApi } from '../../src/modules/requests/public/requests-ai-source.api';
import type { AiSourceStep } from '../../src/modules/requests/public/requests.types';

/**
 * In-memory stand-ins for the unit specs of the AI summary of the queue (`src/modules/ai-assist/queue-summary`): the store of the
 * invocations (with the partial unique index of the migration), the source of the steps, the switches, the audit trail and the AI
 * service. They hold state; the specs assert on it.
 */

export const ORGANIZATION_ID = '0a000000-0000-4000-8000-000000000001';
const TX = { fake: 'transaction' } as unknown as DbTx;

/** A row of `ai_invocations` with its content, as the fake keeps it. */
export interface FakeInvocationRow extends InvocationRecord {
  finishedAt: Date | null;
  context: NewInvocation['context'];
  outcome: InvocationOutcome | null;
}

const KEPT = new Set(['PENDING', 'RUNNING', 'COMPLETED']);
const LIVE = new Set(['PENDING', 'RUNNING']);
const sameKey = (row: FakeInvocationRow, key: InvocationKey & { sourceRevision: string }) =>
  row.organizationId === key.organizationId &&
  row.actorAppUserId === key.actorAppUserId &&
  row.feature === key.feature &&
  row.sourceRevision === key.sourceRevision;
const stuck = (row: FakeInvocationRow, startedBefore: Date) =>
  LIVE.has(row.status) && (row.startedAt ?? row.createdAt).getTime() < startedBefore.getTime();

export class FakeInvocationRepo implements Pick<AiInvocationRepo, keyof AiInvocationRepo> {
  readonly rows = new Map<string, FakeInvocationRow>();

  insert(_tx: DbTx, input: NewInvocation): Promise<{ id: string }> {
    if (KEPT.has(input.status) && [...this.rows.values()].some((row) => KEPT.has(row.status) && sameKey(row, input))) {
      return Promise.reject(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'fake',
          meta: { target: 'ai_invocations_active_per_revision' },
        }),
      );
    }
    const id = randomUUID();
    this.rows.set(id, {
      id,
      organizationId: input.organizationId,
      feature: input.feature,
      actorAppUserId: input.actorAppUserId,
      actorEmployeeId: input.actorEmployeeId,
      status: input.status,
      sourceRevision: input.sourceRevision,
      errorCode: input.errorCode,
      createdAt: input.at,
      startedAt: null,
      finishedAt: input.status === 'FAILED' ? input.at : null,
      result: null,
      context: input.context,
      outcome: null,
    });

    return Promise.resolve({ id });
  }

  findLive(key: InvocationKey & { sourceRevision: string }): Promise<LiveInvocation | null> {
    const row = [...this.rows.values()].find((candidate) => KEPT.has(candidate.status) && sameKey(candidate, key));

    return Promise.resolve(row ? { id: row.id, status: row.status as LiveInvocation['status'] } : null);
  }

  stuckOf(_tx: DbTx, key: InvocationKey, startedBefore: Date): Promise<string[]> {
    const ids = [...this.rows.values()]
      .filter((row) => sameKey(row, { ...key, sourceRevision: row.sourceRevision }) && stuck(row, startedBefore))
      .map((row) => row.id);

    return Promise.resolve(ids);
  }

  expire(_tx: DbTx, id: string, startedBefore: Date, at: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !stuck(row, startedBefore)) return Promise.resolve(false);
    Object.assign(row, { status: 'FAILED', errorCode: 'AI.PROVIDER_TIMEOUT', finishedAt: at });

    return Promise.resolve(true);
  }

  markRunning(id: string, at: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.status !== 'PENDING') return Promise.resolve(false);
    Object.assign(row, { status: 'RUNNING', startedAt: at });

    return Promise.resolve(true);
  }

  finish(_tx: DbTx, id: string, outcome: InvocationOutcome, at: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.status !== 'RUNNING') return Promise.resolve(false);
    Object.assign(row, {
      status: outcome.status,
      errorCode: outcome.errorCode,
      finishedAt: at,
      result: outcome.content?.result ?? null,
      outcome,
    });

    return Promise.resolve(true);
  }

  findOwned(id: string, actorAppUserId: string): Promise<InvocationRecord | null> {
    const row = this.rows.get(id);

    return Promise.resolve(row && row.actorAppUserId === actorAppUserId ? { ...row } : null);
  }

  /** A row put straight into the store, for a state the service cannot reach by itself (a run that stopped). */
  put(row: Partial<FakeInvocationRow> & Pick<FakeInvocationRow, 'status' | 'actorAppUserId'>): string {
    const id = row.id ?? randomUUID();
    this.rows.set(id, {
      id,
      organizationId: ORGANIZATION_ID,
      feature: 'ACCESS_REQUEST_QUEUE_SUMMARY',
      actorEmployeeId: randomUUID(),
      sourceRevision: 'r'.repeat(64),
      errorCode: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      result: null,
      context: { generatedAt: new Date().toISOString(), requests: [] },
      outcome: null,
      ...row,
    });

    return id;
  }
}

/** The steps that wait for the person, as the facade of `requests` reads them; `held` is what is still theirs now. */
export class FakeStepSource {
  steps: AiSourceStep[] = [];
  /** The number of steps that wait in all; the length of `steps` when left null. */
  total: number | null = null;
  /** The ids of the steps still given to the person; all of `steps` when left null. */
  held: Set<string> | null = null;
  failure: Error | null = null;

  readonly openStepsHeldBy = jest.fn<
    Promise<{ steps: AiSourceStep[]; total: number }>,
    [employeeId: string, limit: number, tx?: DbTx]
  >((_employeeId, limit) => {
    if (this.failure) return Promise.reject(this.failure);

    return Promise.resolve({ steps: this.steps.slice(0, limit), total: this.total ?? this.steps.length });
  });

  readonly stillHeldBy = jest.fn<
    Promise<ReadonlySet<string>>,
    [employeeId: string, stepIds: readonly string[], tx?: DbTx]
  >((_employeeId, stepIds) => {
    const held = this.held ?? new Set(this.steps.map((step) => step.stepId));

    return Promise.resolve(new Set(stepIds.filter((id) => held.has(id))));
  });
}

/** The AI service: answers with what `reply` builds from the request, or fails with it. */
export class FakeAiService extends AiServiceClient {
  isConfigured = true;
  reply: (request: QueueSummaryServiceRequest) => Promise<QueueSummaryServiceResponse> = () =>
    Promise.reject(new Error('no reply set'));
  readonly summarizeQueue = jest.fn<
    Promise<QueueSummaryServiceResponse>,
    [request: QueueSummaryServiceRequest, signal: AbortSignal]
  >((request) => this.reply(request));

  configured(): boolean {
    return this.isConfigured;
  }
}

/** An answer of the AI service in the shape of contract v1, with the lines given. */
export function serviceAnswer(
  request: QueueSummaryServiceRequest,
  items: { sourceRef: string; stepKind: AiSourceStep['stepKind']; summary: string }[] | null,
): QueueSummaryServiceResponse {
  return {
    contractVersion: '1',
    invocationId: request.invocationId,
    modelId: 'qwen3-4b-instruct',
    modelRevision: 'rev-7',
    promptVersion: 'access-request-queue-summary-v1',
    schemaVersion: 'access-request-queue-summary.v1',
    promptText: `PROMPT ${JSON.stringify(request.context)}`,
    rawResponse: `RAW ${JSON.stringify(items)}`,
    parsed: items === null ? null : { items },
    parseStatus: items === null ? 'INVALID_JSON' : 'OK',
    usage: { promptTokens: 321, completionTokens: 54 },
    latencyMs: 1234,
  };
}

export function principal(employeeId: string, appUserId = randomUUID()): AuthenticatedPrincipal {
  return {
    subject: appUserId,
    appUserId,
    sessionId: randomUUID(),
    employeeId,
    directRoles: ['MANAGER'],
    roles: ['MANAGER'],
  };
}

/** A step of the source; `index` makes the ids and the order. */
export function sourceStep(index: number, overrides: Partial<AiSourceStep> = {}): AiSourceStep {
  const id = String(index).padStart(12, '0');

  return {
    stepId: `00000000-0000-4000-8000-${id}`,
    requestId: `10000000-0000-4000-8000-${id}`,
    stepKind: 'NEED_APPROVAL',
    assignedAt: new Date(Date.UTC(2026, 10, 1, 8, index)),
    softwareName: 'Figma',
    beneficiaryDisplayName: 'Nguyễn An',
    reason: 'Cần cho dự án thiết kế',
    termMonths: 3,
    estimatedCost: null,
    ...overrides,
  };
}

/** The service of the summary on the fakes above, with both switches ON unless told otherwise. */
export function queueSummaryWorld() {
  const repo = new FakeInvocationRepo();
  const source = new FakeStepSource();
  const ai = new FakeAiService();
  const events: AuditEventInput[] = [];
  const switches = new Map<string, string>([
    ['AI_ENABLED', 'ON'],
    ['AI_ACCESS_REQUEST_SUMMARY_ENABLED', 'ON'],
  ]);
  const runner = { run: <T>(work: (tx: DbTx) => Promise<T>) => work(TX) } as unknown as TransactionRunner;
  const audit = {
    record: (_tx: DbTx, event: AuditEventInput) => {
      events.push(event);

      return Promise.resolve();
    },
  } as unknown as AuditApi;
  const parameters = {
    getValue: (key: string) => Promise.resolve(switches.get(key) ?? 'OFF'),
  } as unknown as OperatingParametersApi;
  const organizations = {
    getOrganization: () => Promise.resolve({ id: ORGANIZATION_ID }),
  } as unknown as OrganizationReadApi;
  const facade = source as unknown as RequestsAiSourceApi;
  const fakeRepo = repo as unknown as AiInvocationRepo;
  const runs = new QueueSummaryRunService(runner, fakeRepo, facade, audit, ai);
  const service = new QueueSummaryService(runner, fakeRepo, facade, parameters, organizations, audit, ai, runs);

  return { service, runs, repo, source, ai, events, switches };
}
