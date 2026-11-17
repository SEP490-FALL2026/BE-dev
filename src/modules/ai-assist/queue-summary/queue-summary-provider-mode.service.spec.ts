import { Logger } from '@nestjs/common';
import { principal, queueSummaryWorld, serviceAnswer, sourceStep } from '../../../../test/support/ai-assist-fakes';
import { AiServiceUnavailableError } from '../ai-service/ai-service.errors';
import type { QueueSummaryServiceResponse } from '../ai-service/ai-service.types';
import { queueRevisionOf } from './queue-summary-context.policy';
import { AiDisabledError, AiProviderUnavailableError } from './queue-summary.errors';

const EMPLOYEE = 'e0000000-0000-4000-8000-000000000003';
const MODES = ['MODEL', 'SIMULATED'] as const;

beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

/** The world of the summary with two steps waiting, the model answering one faithful line per step, in the mode given. */
function world(mode = 'MODEL') {
  const setup = queueSummaryWorld();
  setup.switches.set('AI_PROVIDER_MODE', mode);
  setup.source.steps = [
    sourceStep(1),
    sourceStep(2, { stepKind: 'SPEND_APPROVAL', estimatedCost: { amount: '1200000', currency: 'VND' } }),
  ];
  setup.ai.reply = (request) =>
    Promise.resolve(
      serviceAnswer(
        request,
        request.context.requests.map((line) => ({
          sourceRef: line.sourceRef,
          stepKind: line.stepKind,
          summary: `${line.beneficiaryDisplayName} đề nghị ${line.softwareName}.`,
        })),
      ),
    );
  const simulatedCalls = jest.spyOn(setup.simulated, 'summarizeQueue');
  const actor = principal(EMPLOYEE);
  const revision = queueRevisionOf(setup.source.steps, setup.source.steps.length);

  return { ...setup, simulatedCalls, actor, revision };
}

describe('QueueSummaryService and the mode of a call (AI_PROVIDER_MODE)', () => {
  // AC-16: the master switch decides before the mode does.
  it.each(MODES.flatMap((mode) => ['AI_ENABLED', 'AI_ACCESS_REQUEST_SUMMARY_ENABLED'].map((key) => [mode, key])))(
    'in %s, refuses with AI.DISABLED when %s is OFF, and neither source is asked',
    async (mode, key) => {
      const { service, switches, ai, simulatedCalls, repo, actor, revision } = world(mode);
      switches.set(key, 'OFF');

      await expect(service.create(actor, { queueRevision: revision })).rejects.toThrow(AiDisabledError);
      expect(ai.summarizeQueue).not.toHaveBeenCalled();
      expect(simulatedCalls).not.toHaveBeenCalled();
      expect(repo.rows.size).toBe(0);
    },
  );

  it('SIMULATED needs no AI service: the call is recorded SIMULATED and answered by the simulation, through the same checks', async () => {
    const { service, runs, ai, simulatedCalls, repo, actor, revision } = world('SIMULATED');
    ai.isConfigured = false;

    const created = await service.create(actor, { queueRevision: revision });
    await runs.idle();

    const row = repo.rows.get(created.invocationId);
    expect(row).toMatchObject({ providerMode: 'SIMULATED', status: 'COMPLETED', errorCode: null });
    expect(row?.outcome?.metadata).toMatchObject({ modelId: 'saas-sentry-simulated', promptVersion: 'simulated-v1' });
    expect(row?.result?.accepted.map((item) => item.sourceRef)).toEqual(['R001', 'R002']);
    expect(row?.result?.rejections).toEqual([]);
    expect(simulatedCalls).toHaveBeenCalledTimes(1);
    expect(ai.summarizeQueue).not.toHaveBeenCalled();
  });

  it('MODEL with no AI service configured refuses with AI.PROVIDER_UNAVAILABLE and writes nothing', async () => {
    const { service, ai, simulatedCalls, repo, events, actor, revision } = world('MODEL');
    ai.isConfigured = false;

    await expect(service.create(actor, { queueRevision: revision })).rejects.toThrow(AiProviderUnavailableError);
    expect(repo.rows.size).toBe(0);
    expect(events).toEqual([]);
    expect(simulatedCalls).not.toHaveBeenCalled();
  });

  it.each([
    ['a value outside the two', 'OPENAI'],
    ['a value of the switches', 'ON'],
  ])('takes %s for SIMULATED and warns the operator', async (_name, value) => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, runs, ai, repo, actor, revision } = world(value);
    ai.isConfigured = false;

    const created = await service.create(actor, { queueRevision: revision });
    await runs.idle();

    expect(repo.rows.get(created.invocationId)).toMatchObject({ providerMode: 'SIMULATED', status: 'COMPLETED' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('AI_PROVIDER_MODE');
    expect(String(warn.mock.calls[0][0])).not.toContain(value);
  });

  it.each(MODES)('takes %s as it is and warns nobody', async (mode) => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, runs, repo, actor, revision } = world(mode);

    const created = await service.create(actor, { queueRevision: revision });
    await runs.idle();

    expect(repo.rows.get(created.invocationId)?.providerMode).toBe(mode);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(MODES)('reads a summary made in %s with simulated true only for the simulation', async (mode) => {
    const { service, runs, actor, revision } = world(mode);

    const created = await service.create(actor, { queueRevision: revision });
    await runs.idle();

    await expect(service.get(actor, created.invocationId)).resolves.toMatchObject({
      status: 'COMPLETED',
      simulated: mode === 'SIMULATED',
    });
  });

  it('reads a simulated call that shows nothing with simulated true as well', async () => {
    const { service, repo, actor, revision } = world('SIMULATED');
    const failed = repo.put({
      status: 'FAILED',
      errorCode: 'AI.PROVIDER_UNAVAILABLE',
      providerMode: 'SIMULATED',
      actorAppUserId: actor.appUserId,
      sourceRevision: revision,
    });

    await expect(service.get(actor, failed)).resolves.toMatchObject({ status: 'FAILED', simulated: true, items: [] });
  });

  it.each(MODES)('writes the mode %s into every audit event of the call, REQUESTED and its end', async (mode) => {
    const { service, runs, events, actor, revision } = world(mode);

    await service.create(actor, { queueRevision: revision });
    await runs.idle();

    expect(events.map((event) => [event.action, event.after?.providerMode])).toEqual([
      ['AI_INVOCATION.REQUESTED', mode],
      ['AI_INVOCATION.COMPLETED', mode],
    ]);
  });

  it('writes the mode of a failed MODEL call and of a call whose source cannot be read into their FAILED events', async () => {
    const failing = world('MODEL');
    failing.ai.reply = () => Promise.reject(new AiServiceUnavailableError(500, 'MODEL_ERROR'));
    await failing.service.create(failing.actor, { queueRevision: failing.revision });
    await failing.runs.idle();
    const unreadable = world('SIMULATED');
    unreadable.source.failure = new TypeError('broken step');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await unreadable.service.create(unreadable.actor, { queueRevision: unreadable.revision });

    expect(failing.events.map((event) => [event.action, event.after?.providerMode])).toEqual([
      ['AI_INVOCATION.REQUESTED', 'MODEL'],
      ['AI_INVOCATION.FAILED', 'MODEL'],
    ]);
    expect(unreadable.events.map((event) => [event.action, event.after?.providerMode])).toEqual([
      ['AI_INVOCATION.REQUESTED', 'SIMULATED'],
      ['AI_INVOCATION.FAILED', 'SIMULATED'],
    ]);
  });

  it('a call keeps the mode it was made in when the Super Admin changes the mode while it runs', async () => {
    const { service, runs, ai, simulatedCalls, repo, switches, actor, revision } = world('MODEL');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const reply = ai.reply;
    ai.reply = async (request): Promise<QueueSummaryServiceResponse> => {
      await held;

      return reply(request);
    };

    const created = await service.create(actor, { queueRevision: revision });
    await new Promise((resolve) => setImmediate(resolve));
    expect(repo.rows.get(created.invocationId)?.status).toBe('RUNNING');
    switches.set('AI_PROVIDER_MODE', 'SIMULATED');
    release();
    await runs.idle();

    expect(repo.rows.get(created.invocationId)).toMatchObject({ providerMode: 'MODEL', status: 'COMPLETED' });
    expect(repo.rows.get(created.invocationId)?.outcome?.metadata?.modelId).toBe('qwen3-4b-instruct');
    expect(ai.summarizeQueue).toHaveBeenCalledTimes(1);
    expect(simulatedCalls).not.toHaveBeenCalled();
  });

  // AC-17: a model that fails is never replaced by the simulation.
  it('MODEL with the AI service failing ends FAILED AI.PROVIDER_UNAVAILABLE with no line, and the simulation is never asked', async () => {
    const { service, runs, ai, simulatedCalls, repo, actor, revision } = world('MODEL');
    ai.reply = () => Promise.reject(new AiServiceUnavailableError(500, 'MODEL_ERROR'));

    const created = await service.create(actor, { queueRevision: revision });
    await runs.idle();

    expect(repo.rows.get(created.invocationId)).toMatchObject({
      providerMode: 'MODEL',
      status: 'FAILED',
      errorCode: 'AI.PROVIDER_UNAVAILABLE',
      result: null,
    });
    expect(simulatedCalls).not.toHaveBeenCalled();
  });

  it('keeps one call per queue revision and mode: the other mode makes a new call, the same mode gives the kept one back', async () => {
    const { service, runs, repo, switches, actor, revision } = world('MODEL');

    const model = await service.create(actor, { queueRevision: revision });
    await runs.idle();
    switches.set('AI_PROVIDER_MODE', 'SIMULATED');
    const simulated = await service.create(actor, { queueRevision: revision });
    await runs.idle();
    const simulatedAgain = await service.create(actor, { queueRevision: revision });
    switches.set('AI_PROVIDER_MODE', 'MODEL');
    const modelAgain = await service.create(actor, { queueRevision: revision });

    expect(simulated.invocationId).not.toBe(model.invocationId);
    expect(simulatedAgain).toEqual({ invocationId: simulated.invocationId, status: 'COMPLETED' });
    expect(modelAgain).toEqual({ invocationId: model.invocationId, status: 'COMPLETED' });
    expect([...repo.rows.values()].map((row) => row.providerMode).sort()).toEqual(['MODEL', 'SIMULATED']);
  });

  it('looks for the call of the race to the unique index in the mode of the request', async () => {
    const { service, runs, repo, switches, actor, revision } = world('SIMULATED');
    const first = await service.create(actor, { queueRevision: revision });
    await runs.idle();
    switches.set('AI_PROVIDER_MODE', 'SIMULATED');
    const findLive = jest.spyOn(repo, 'findLive').mockResolvedValueOnce(null);

    await expect(service.create(actor, { queueRevision: revision })).resolves.toEqual({
      invocationId: first.invocationId,
      status: 'COMPLETED',
    });
    expect(findLive.mock.calls.map(([key]) => key.providerMode)).toEqual(['SIMULATED', 'SIMULATED']);
  });

  it('takes a stuck run of the other mode for FAILED too, and its FAILED event names the mode of that run', async () => {
    const { service, runs, repo, events, actor, revision } = world('MODEL');
    const stuck = repo.put({
      status: 'RUNNING',
      providerMode: 'SIMULATED',
      actorAppUserId: actor.appUserId,
      sourceRevision: revision,
      startedAt: new Date(Date.now() - 151_000),
    });

    await service.create(actor, { queueRevision: revision });
    await runs.idle();

    expect(repo.rows.get(stuck)).toMatchObject({ status: 'FAILED', errorCode: 'AI.PROVIDER_TIMEOUT' });
    expect(events.filter((event) => event.resourceId === stuck)).toEqual([
      expect.objectContaining({
        action: 'AI_INVOCATION.FAILED',
        after: expect.objectContaining({ errorCode: 'AI.PROVIDER_TIMEOUT', providerMode: 'SIMULATED' }) as unknown,
      }),
    ]);
  });

  it.each(MODES)(
    'takes a stuck %s run its owner reads for FAILED, and its FAILED event names that mode',
    async (mode) => {
      const { service, repo, events, actor, revision } = world('MODEL');
      const stuck = repo.put({
        status: 'RUNNING',
        providerMode: mode,
        actorAppUserId: actor.appUserId,
        sourceRevision: revision,
        startedAt: new Date(Date.now() - 151_000),
      });

      await expect(service.get(actor, stuck)).resolves.toMatchObject({
        status: 'FAILED',
        simulated: mode === 'SIMULATED',
      });
      expect(events).toEqual([
        expect.objectContaining({
          action: 'AI_INVOCATION.FAILED',
          resourceId: stuck,
          after: expect.objectContaining({ errorCode: 'AI.PROVIDER_TIMEOUT', providerMode: mode }) as unknown,
        }),
      ]);
    },
  );

  it('records a call whose source cannot be read with the mode it was asked in', async () => {
    const { service, ai, source, repo, actor, revision } = world('SIMULATED');
    ai.isConfigured = false;
    source.failure = new TypeError('broken step');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const created = await service.create(actor, { queueRevision: revision });

    expect(repo.rows.get(created.invocationId)).toMatchObject({
      providerMode: 'SIMULATED',
      status: 'FAILED',
      errorCode: 'AI.SOURCE_UNREADABLE',
    });
  });
});
