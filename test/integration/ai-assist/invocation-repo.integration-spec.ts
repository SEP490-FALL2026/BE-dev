import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../src/infrastructure/database/unique-violation';
import { AiInvocationContentRepo } from '../../../src/modules/ai-assist/invocation/invocation-content.repo';
import { AiInvocationRepo } from '../../../src/modules/ai-assist/invocation/invocation.repo';
import type { InvocationOutcome, NewInvocation } from '../../../src/modules/ai-assist/invocation/invocation.types';
import {
  type DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { testConfig } from '../../support/test-config';

const CONTEXT: NewInvocation['context'] = {
  generatedAt: '2026-11-04T09:00:00.000Z',
  requests: [
    {
      sourceRef: 'R001',
      stepKind: 'SPEND_APPROVAL',
      softwareName: 'Notion',
      beneficiaryDisplayName: 'Nhóm 5 người',
      reason: 'Họp nhóm',
      requestedDurationLabel: '6 tháng',
      estimatedCostRef: 'C001',
    },
  ],
};

const OUTCOME: InvocationOutcome = {
  status: 'COMPLETED',
  errorCode: null,
  metadata: {
    modelId: 'qwen3-4b',
    modelRevision: 'rev-1',
    promptVersion: 'access-request-queue-summary-v1',
    schemaVersion: 'access-request-queue-summary.v1',
    configFingerprint: 'f'.repeat(64),
    latencyMs: 900,
    promptTokens: 120,
    completionTokens: 30,
  },
  content: {
    promptText: 'the prompt',
    rawResponse: '{"items":[]}',
    parsed: { items: [{ sourceRef: 'R001', stepKind: 'SPEND_APPROVAL', summary: 'Nhóm cần Notion, {{cost:C001}}.' }] },
    result: {
      total: 1,
      steps: [{ sourceRef: 'R001', stepId: randomUUID(), requestId: randomUUID(), stepKind: 'SPEND_APPROVAL' }],
      accepted: [{ sourceRef: 'R001', summary: 'Nhóm cần Notion, 1200000 VND.' }],
      rejections: [],
    },
  },
};

// The SQL of the store of the AI calls: the partial unique index as the service recognises it, and the moves of status that are
// each conditional on the status they leave.
describe('AiInvocationRepo (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let prisma: PrismaService;
  let runner: TransactionRunner;
  let repo: AiInvocationRepo;
  const organizationId = randomUUID();

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    const config = testConfig({ DATABASE_URL: database.url });
    prisma = new PrismaService(config);
    runner = new TransactionRunner(prisma, config);
    repo = new AiInvocationRepo(prisma);
  }, 240000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database) await dropDisposableDatabase(database);
  });

  const call = (overrides: Partial<NewInvocation> = {}): NewInvocation => ({
    organizationId,
    actorAppUserId: randomUUID(),
    actorEmployeeId: randomUUID(),
    feature: 'ACCESS_REQUEST_QUEUE_SUMMARY',
    providerMode: 'MODEL',
    sourceRevision: 'a'.repeat(64),
    context: CONTEXT,
    status: 'PENDING',
    errorCode: null,
    at: new Date(),
    ...overrides,
  });

  it('keeps one call per queue revision, refused in the words the service recognises', async () => {
    const input = call();
    const { id } = await runner.run((tx) => repo.insert(tx, input));

    const second = await runner.run((tx) => repo.insert(tx, input)).catch((error: unknown) => error);

    expect(isUniqueViolation(second, 'ai_invocations_active_per_revision', 'source_revision')).toBe(true);
    await expect(repo.findLive(input)).resolves.toEqual({ id, status: 'PENDING' });
    const content = await prisma.aiInvocationContent.findUniqueOrThrow({ where: { invocationId: id } });
    expect(content.context).toEqual(CONTEXT);
  });

  it('runs a call and records its end with the metadata and the content, once', async () => {
    const input = call();
    const { id } = await runner.run((tx) => repo.insert(tx, input));

    await expect(repo.markRunning(id, new Date())).resolves.toBe(true);
    await expect(repo.markRunning(id, new Date())).resolves.toBe(false);
    await expect(runner.run((tx) => repo.finish(tx, id, OUTCOME, new Date()))).resolves.toBe(true);
    await expect(runner.run((tx) => repo.finish(tx, id, OUTCOME, new Date()))).resolves.toBe(false);

    const row = await prisma.aiInvocation.findUniqueOrThrow({ where: { id }, include: { content: true } });
    expect(row).toMatchObject({
      status: 'COMPLETED',
      configHash: 'f'.repeat(64),
      modelId: 'qwen3-4b',
      latencyMs: 900,
      promptTokens: 120,
      completionTokens: 30,
    });
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(row.content).toMatchObject({ promptText: 'the prompt', parsed: OUTCOME.content?.parsed });
    await expect(repo.findOwned(id, input.actorAppUserId)).resolves.toMatchObject({
      id,
      status: 'COMPLETED',
      result: OUTCOME.content?.result,
    });
    await expect(repo.findOwned(id, randomUUID())).resolves.toBeNull();
    await expect(repo.findLive(input)).resolves.toEqual({ id, status: 'COMPLETED' });
  });

  it('reads no call whose content was purged, and keeps the call itself', async () => {
    const input = call();
    const { id } = await runner.run((tx) => repo.insert(tx, input));
    await expect(repo.findOwned(id, input.actorAppUserId)).resolves.toMatchObject({ id });

    await prisma.aiInvocationContent.delete({ where: { invocationId: id } });

    await expect(repo.findOwned(id, input.actorAppUserId)).resolves.toBeNull();
    await expect(prisma.aiInvocation.findUnique({ where: { id } })).resolves.toMatchObject({ id });
  });

  it('takes a call stuck for too long for FAILED, and a run that ends after that writes nothing', async () => {
    const input = call({ at: new Date(Date.now() - 300_000) });
    const { id } = await runner.run((tx) => repo.insert(tx, input));
    await repo.markRunning(id, new Date(Date.now() - 200_000));
    const cutoff = new Date(Date.now() - 150_000);

    await expect(runner.run((tx) => repo.stuckOf(tx, input, cutoff))).resolves.toEqual([{ id, providerMode: 'MODEL' }]);
    await expect(runner.run((tx) => repo.expire(tx, id, cutoff, new Date()))).resolves.toBe(true);
    await expect(runner.run((tx) => repo.expire(tx, id, cutoff, new Date()))).resolves.toBe(false);
    await expect(runner.run((tx) => repo.finish(tx, id, OUTCOME, new Date()))).resolves.toBe(false);

    const row = await prisma.aiInvocation.findUniqueOrThrow({ where: { id }, include: { content: true } });
    expect(row).toMatchObject({ status: 'FAILED', errorCode: 'AI.PROVIDER_TIMEOUT', promptTokens: null });
    expect(row.content?.promptText).toBeNull();
    // A failed call no longer holds the revision: the next one may be recorded.
    await expect(repo.findLive(input)).resolves.toBeNull();
    await expect(runner.run((tx) => repo.insert(tx, call({ actorAppUserId: input.actorAppUserId })))).resolves.toEqual({
      id: expect.any(String) as unknown,
    });
  });

  it('leaves a recent run alone, and records a call that failed at once with its end', async () => {
    const input = call();
    const { id } = await runner.run((tx) => repo.insert(tx, input));
    await repo.markRunning(id, new Date());

    await expect(runner.run((tx) => repo.stuckOf(tx, input, new Date(Date.now() - 150_000)))).resolves.toEqual([]);
    const failed = await runner.run((tx) =>
      repo.insert(
        tx,
        call({ status: 'FAILED', errorCode: 'AI.SOURCE_UNREADABLE', context: { ...CONTEXT, requests: [] } }),
      ),
    );
    await expect(prisma.aiInvocation.findUniqueOrThrow({ where: { id: failed.id } })).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'AI.SOURCE_UNREADABLE',
      finishedAt: expect.any(Date) as unknown,
    });
  });

  it('keeps one call per queue revision and mode: the other mode is a call of its own, read back with its mode', async () => {
    const model = call();
    const simulated: NewInvocation = { ...model, providerMode: 'SIMULATED' };
    const first = await runner.run((tx) => repo.insert(tx, model));
    const second = await runner.run((tx) => repo.insert(tx, simulated));

    await expect(repo.findLive(model)).resolves.toEqual({ id: first.id, status: 'PENDING' });
    await expect(repo.findLive(simulated)).resolves.toEqual({ id: second.id, status: 'PENDING' });
    const again = await runner.run((tx) => repo.insert(tx, simulated)).catch((error: unknown) => error);
    expect(isUniqueViolation(again, 'ai_invocations_active_per_revision', 'source_revision')).toBe(true);
    await expect(repo.findOwned(second.id, model.actorAppUserId)).resolves.toMatchObject({ providerMode: 'SIMULATED' });
    await expect(runner.run((tx) => new AiInvocationContentRepo(prisma).find(tx, second.id))).resolves.toMatchObject({
      invocationId: second.id,
      organizationId,
      providerMode: 'SIMULATED',
    });
  });

  it('gives the stuck calls of the person in every mode, each with its mode', async () => {
    const model = call({ at: new Date(Date.now() - 300_000) });
    const simulated: NewInvocation = { ...model, providerMode: 'SIMULATED', sourceRevision: 'b'.repeat(64) };
    const ids = [
      (await runner.run((tx) => repo.insert(tx, model))).id,
      (await runner.run((tx) => repo.insert(tx, simulated))).id,
    ];

    const stuck = await runner.run((tx) => repo.stuckOf(tx, model, new Date(Date.now() - 150_000)));

    expect([...stuck].sort((a, b) => a.providerMode.localeCompare(b.providerMode))).toEqual([
      { id: ids[0], providerMode: 'MODEL' },
      { id: ids[1], providerMode: 'SIMULATED' },
    ]);
  });
});
