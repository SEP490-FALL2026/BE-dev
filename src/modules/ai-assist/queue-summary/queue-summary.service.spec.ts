import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  ORGANIZATION_ID,
  principal,
  queueSummaryWorld,
  serviceAnswer,
  sourceStep,
} from '../../../../test/support/ai-assist-fakes';
import { queueRevisionOf } from './queue-summary-context.policy';
import {
  AiDisabledError,
  AiProviderUnavailableError,
  NoAssignedStepsError,
  SummaryNotFoundError,
  SummarySourceStaleError,
} from './queue-summary.errors';

const EMPLOYEE = 'e0000000-0000-4000-8000-000000000001';

beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

function world(stepCount = 3) {
  const setup = queueSummaryWorld();
  setup.source.steps = Array.from({ length: stepCount }, (_value, index) =>
    index === 1
      ? sourceStep(index + 1, { stepKind: 'SPEND_APPROVAL', estimatedCost: { amount: '1200000', currency: 'VND' } })
      : sourceStep(index + 1),
  );
  setup.ai.reply = (request) =>
    Promise.resolve(
      serviceAnswer(
        request,
        request.context.requests.map((line) => ({
          sourceRef: line.sourceRef,
          stepKind: line.stepKind,
          summary:
            line.estimatedCostRef === null
              ? `${line.beneficiaryDisplayName} đề nghị ${line.softwareName}.`
              : `${line.beneficiaryDisplayName} cần ${line.softwareName}, chi phí {{cost:${line.estimatedCostRef}}}.`,
        })),
      ),
    );
  const actor = principal(EMPLOYEE);
  const revision = () =>
    queueRevisionOf(setup.source.steps.slice(0, 20), setup.source.total ?? setup.source.steps.length);

  return { ...setup, actor, revision };
}

describe('QueueSummaryService.create', () => {
  it.each(['AI_ENABLED', 'AI_ACCESS_REQUEST_SUMMARY_ENABLED'])(
    'refuses with AI.DISABLED when %s is OFF, before reading a step or calling the AI service',
    async (key) => {
      const { service, switches, source, ai, repo, actor, revision } = world();
      switches.set(key, 'OFF');

      await expect(service.create(actor, { queueRevision: revision() })).rejects.toThrow(AiDisabledError);
      expect(source.openStepsHeldBy).not.toHaveBeenCalled();
      expect(ai.summarizeQueue).not.toHaveBeenCalled();
      expect(repo.rows.size).toBe(0);
    },
  );

  it('refuses with AI.PROVIDER_UNAVAILABLE when no AI service is configured, writing nothing', async () => {
    const { service, ai, repo, events, actor, revision } = world();
    ai.isConfigured = false;

    await expect(service.create(actor, { queueRevision: revision() })).rejects.toThrow(AiProviderUnavailableError);
    expect(repo.rows.size).toBe(0);
    expect(events).toEqual([]);
  });

  // AC-9: a person with no step given to them never reaches the model.
  it('refuses with AI.NO_ASSIGNED_STEPS when nothing waits for the person, and never calls the AI service', async () => {
    const { service, ai, repo, events, actor } = world(0);

    await expect(service.create(actor, { queueRevision: queueRevisionOf([], 0) })).rejects.toThrow(
      NoAssignedStepsError,
    );
    expect(ai.summarizeQueue).not.toHaveBeenCalled();
    expect(repo.rows.size).toBe(0);
    expect(events).toEqual([]);
  });

  it('refuses with AI.SOURCE_STALE when the queue the person sees is not the queue now', async () => {
    const { service, ai, repo, actor } = world();

    await expect(service.create(actor, { queueRevision: 'f'.repeat(64) })).rejects.toThrow(SummarySourceStaleError);
    expect(ai.summarizeQueue).not.toHaveBeenCalled();
    expect(repo.rows.size).toBe(0);
  });

  it('reads the first 20 steps in one transaction, records the call as PENDING with its context and audit, and runs it', async () => {
    const { service, runs, repo, source, events, actor, revision } = world();

    const created = await service.create(actor, { queueRevision: revision() });

    expect(created).toEqual({ invocationId: expect.any(String) as unknown, status: 'PENDING' });
    expect(source.openStepsHeldBy).toHaveBeenCalledWith(EMPLOYEE, 20, expect.anything());
    const row = repo.rows.get(created.invocationId);
    expect(row).toMatchObject({
      organizationId: ORGANIZATION_ID,
      feature: 'ACCESS_REQUEST_QUEUE_SUMMARY',
      actorAppUserId: actor.appUserId,
      actorEmployeeId: EMPLOYEE,
      sourceRevision: revision(),
    });
    expect(row?.context.requests.map((line) => line.sourceRef)).toEqual(['R001', 'R002', 'R003']);
    expect(events[0]).toMatchObject({
      organizationId: ORGANIZATION_ID,
      actorKind: 'USER',
      actorAppUserId: actor.appUserId,
      action: 'AI_INVOCATION.REQUESTED',
      resourceType: 'AiInvocation',
      resourceId: created.invocationId,
      correlationId: actor.sessionId,
      after: expect.objectContaining({
        feature: 'ACCESS_REQUEST_QUEUE_SUMMARY',
        stepCount: 3,
        omittedCount: 0,
      }) as unknown,
    });

    await runs.idle();
    expect(repo.rows.get(created.invocationId)?.status).toBe('COMPLETED');
  });

  it('gives back the call already made for the same queue revision instead of calling the model again', async () => {
    const { service, runs, ai, repo, actor, revision } = world();

    const first = await service.create(actor, { queueRevision: revision() });
    await runs.idle();
    const insert = jest.spyOn(repo, 'insert');
    const again = await service.create(actor, { queueRevision: revision() });

    expect(again).toEqual({ invocationId: first.invocationId, status: 'COMPLETED' });
    expect(ai.summarizeQueue).toHaveBeenCalledTimes(1);
    // Found in the transaction, never by a refused insert: the unique index is the guard of a race only.
    expect(insert).not.toHaveBeenCalled();
  });

  it('gives back the call of a request that won the race to the unique index', async () => {
    const { service, runs, repo, actor, revision } = world();
    const first = await service.create(actor, { queueRevision: revision() });
    await runs.idle();
    jest.spyOn(repo, 'findLive').mockResolvedValueOnce(null);

    await expect(service.create(actor, { queueRevision: revision() })).resolves.toEqual({
      invocationId: first.invocationId,
      status: 'COMPLETED',
    });
  });

  it('marks a run of the person stuck for more than 150 seconds FAILED before it looks for the call to give back', async () => {
    const { service, runs, repo, events, actor, revision } = world();
    const stuck = repo.put({
      status: 'RUNNING',
      actorAppUserId: actor.appUserId,
      sourceRevision: revision(),
      createdAt: new Date(Date.now() - 200_000),
      startedAt: new Date(Date.now() - 151_000),
    });

    const created = await service.create(actor, { queueRevision: revision() });
    await runs.idle();

    expect(created.invocationId).not.toBe(stuck);
    expect(repo.rows.get(stuck)).toMatchObject({ status: 'FAILED', errorCode: 'AI.PROVIDER_TIMEOUT' });
    expect(events).toContainEqual(
      expect.objectContaining({
        action: 'AI_INVOCATION.FAILED',
        resourceId: stuck,
        after: expect.objectContaining({ errorCode: 'AI.PROVIDER_TIMEOUT' }) as unknown,
      }),
    );
  });

  it('records a call FAILED with AI.SOURCE_UNREADABLE when a step points at a missing record, and never answers a 500', async () => {
    const { service, ai, repo, source, actor, revision } = world();
    const queueRevision = revision();
    source.failure = new Error('The step x points at a missing record.');

    const created = await service.create(actor, { queueRevision });

    expect(created).toEqual({ invocationId: expect.any(String) as unknown, status: 'FAILED' });
    expect(repo.rows.get(created.invocationId)).toMatchObject({ status: 'FAILED', errorCode: 'AI.SOURCE_UNREADABLE' });
    expect(ai.summarizeQueue).not.toHaveBeenCalled();
  });

  it('lets a database that is unavailable for a while through, for the caller to try again', async () => {
    const { service, repo, source, actor, revision } = world();
    source.failure = new Error('Connection terminated unexpectedly');

    await expect(service.create(actor, { queueRevision: revision() })).rejects.toThrow(
      'Connection terminated unexpectedly',
    );
    expect(repo.rows.size).toBe(0);
  });
});

describe('QueueSummaryService.get', () => {
  async function completed(stepCount = 3) {
    const setup = world(stepCount);
    const created = await setup.service.create(setup.actor, { queueRevision: setup.revision() });
    await setup.runs.idle();

    return { ...setup, invocationId: created.invocationId };
  }

  it('answers AI.NOT_FOUND for the call of somebody else, even of the same role, and for an id that is not one', async () => {
    const { service, invocationId } = await completed();

    await expect(service.get(principal(EMPLOYEE), invocationId)).rejects.toThrow(SummaryNotFoundError);
    await expect(service.get(principal(EMPLOYEE), randomUUID())).rejects.toThrow(SummaryNotFoundError);
    await expect(service.get(principal(EMPLOYEE), 'not-an-id')).rejects.toThrow(SummaryNotFoundError);
  });

  it('shows the checked lines with the request they lead to and the cost the backend wrote', async () => {
    const { service, actor, invocationId, source } = await completed();

    const view = await service.get(actor, invocationId);

    expect(view).toEqual({
      invocationId,
      status: 'COMPLETED',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/) as unknown,
      sourceStale: false,
      omittedCount: 0,
      errorCode: null,
      items: [
        {
          requestId: source.steps[0].requestId,
          stepId: source.steps[0].stepId,
          stepKind: 'NEED_APPROVAL',
          summary: 'Nguyễn An đề nghị Figma.',
        },
        {
          requestId: source.steps[1].requestId,
          stepId: source.steps[1].stepId,
          stepKind: 'SPEND_APPROVAL',
          summary: 'Nguyễn An cần Figma, chi phí 1200000 VND.',
        },
        expect.objectContaining({ stepId: source.steps[2].stepId }),
      ],
    });
  });

  it('counts the steps past the first 20 as omitted', async () => {
    const { service, actor, invocationId } = await completed(23);

    const view = await service.get(actor, invocationId);

    expect(view.items).toHaveLength(20);
    expect(view.omittedCount).toBe(3);
  });

  // AC-12: a step decided, withdrawn or given to somebody else after the summary leaves it, and nothing of it shows.
  it('drops the line of a step that is no longer the person’s and says the queue changed', async () => {
    const { service, actor, invocationId, source } = await completed();
    const [first, , third] = source.steps;
    source.steps = [first, third];
    source.held = new Set([first.stepId, third.stepId]);

    const view = await service.get(actor, invocationId);

    expect(view.status).toBe('COMPLETED');
    expect(view.items.map((item) => item.stepId)).toEqual([first.stepId, third.stepId]);
    expect(view.omittedCount).toBe(0);
    expect(view.sourceStale).toBe(true);
    expect(JSON.stringify(view)).not.toContain('1200000');
  });

  it('counts a step still waiting whose line was rejected as omitted', async () => {
    const setup = world();
    setup.ai.reply = (request) =>
      Promise.resolve(
        serviceAnswer(request, [
          { sourceRef: 'R001', stepKind: 'NEED_APPROVAL', summary: 'Nguyễn An đề nghị Figma.' },
          { sourceRef: 'R003', stepKind: 'NEED_APPROVAL', summary: 'Nên duyệt ngay.' },
        ]),
      );
    const created = await setup.service.create(setup.actor, { queueRevision: setup.revision() });
    await setup.runs.idle();

    const view = await setup.service.get(setup.actor, created.invocationId);

    expect(view.items.map((item) => item.stepId)).toEqual([setup.source.steps[0].stepId]);
    expect(view.omittedCount).toBe(2);
  });

  it('shows NO_VALID_OUTPUT when no line of the summary is the person’s any more, and keeps the record as it was', async () => {
    const { service, actor, invocationId, source, repo } = await completed();
    source.held = new Set();

    const view = await service.get(actor, invocationId);

    expect(view).toMatchObject({
      status: 'NO_VALID_OUTPUT',
      items: [],
      omittedCount: 0,
      errorCode: 'AI.NO_VALID_OUTPUT',
    });
    expect(repo.rows.get(invocationId)?.status).toBe('COMPLETED');
  });

  it('marks a run stuck for more than 150 seconds FAILED with AI.PROVIDER_TIMEOUT, and leaves a younger one running', async () => {
    const { service, repo, events, actor } = world();
    const old = repo.put({
      status: 'RUNNING',
      actorAppUserId: actor.appUserId,
      startedAt: new Date(Date.now() - 151_000),
    });
    const young = repo.put({
      status: 'RUNNING',
      actorAppUserId: actor.appUserId,
      startedAt: new Date(Date.now() - 100_000),
    });
    const pending = repo.put({
      status: 'PENDING',
      actorAppUserId: actor.appUserId,
      createdAt: new Date(Date.now() - 151_000),
    });

    await expect(service.get(actor, old)).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'AI.PROVIDER_TIMEOUT',
      items: [],
    });
    await expect(service.get(actor, young)).resolves.toMatchObject({ status: 'RUNNING', errorCode: null, items: [] });
    await expect(service.get(actor, pending)).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'AI.PROVIDER_TIMEOUT',
    });
    expect(events.filter((event) => event.action === 'AI_INVOCATION.FAILED').map((event) => event.resourceId)).toEqual([
      old,
      pending,
    ]);
  });

  it('shows a failed call with its stable code and nothing else', async () => {
    const { service, repo, actor } = world();
    const failed = repo.put({ status: 'FAILED', actorAppUserId: actor.appUserId, errorCode: 'AI.OUTPUT_INVALID' });

    await expect(service.get(actor, failed)).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'AI.OUTPUT_INVALID',
      items: [],
      omittedCount: 0,
      sourceStale: false,
    });
  });
});

describe('QueueSummaryService, when the source fails in a way nobody expected', () => {
  const SECRET_TEXT = 'Nguyễn An lý do mật Figma';

  function logged() {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    return { error, text: () => error.mock.calls.map((call) => call.map(String).join(' ')).join('\n') };
  }

  it('records the call FAILED and tells the operator the kind of error, never its message or the content', async () => {
    const { service, repo, source, actor, revision } = world();
    const queueRevision = revision();
    source.failure = new TypeError(`cannot read ${SECRET_TEXT}`);
    const log = logged();

    const created = await service.create(actor, { queueRevision });

    expect(repo.rows.get(created.invocationId)).toMatchObject({ status: 'FAILED', errorCode: 'AI.SOURCE_UNREADABLE' });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toEqual(expect.stringContaining('TypeError'));
    expect(log.error.mock.calls[0][1]).toEqual(expect.stringMatching(/^\s+at /));
    expect(log.text()).not.toMatch(/Nguyễn|lý do|Figma|cannot read/);
  });

  it('reads the summary as stale and tells the operator, when the queue now cannot be read', async () => {
    const { service, runs, source, actor, revision } = world();
    const created = await service.create(actor, { queueRevision: revision() });
    await runs.idle();
    source.failure = new TypeError(`cannot read ${SECRET_TEXT}`);
    const log = logged();

    const view = await service.get(actor, created.invocationId);

    expect(view).toMatchObject({ status: 'COMPLETED', sourceStale: true });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toEqual(expect.stringContaining('TypeError'));
    expect(log.error.mock.calls[0][1]).toEqual(expect.stringMatching(/^\s+at /));
    expect(log.text()).not.toMatch(/Nguyễn|lý do|Figma|cannot read/);
  });
});
