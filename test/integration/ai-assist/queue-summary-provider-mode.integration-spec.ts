import { AiSummaryHarness, type SummaryWire } from '../../support/ai-summary-harness';
import { stopCliProcesses } from '../../support/cli-process';
import type { AccessRequestWire } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

/** No AI service: the application starts with an empty address, so only the simulation can answer. */
const h = new AiSummaryHarness();
const REASONS = ['Cần công cụ ghi chú cho nhóm', 'Cần công cụ vẽ sơ đồ quy trình'];

/**
 * `US-15-05` AC-16 over the whole application, real PostgreSQL and no AI service configured: the Super Admin chooses where the answers
 * come from (`AI_PROVIDER_MODE`). SIMULATED answers with templated lines built from the source, through the same checks, and needs
 * no AI service; MODEL with none answers 503 `AI.PROVIDER_UNAVAILABLE` as before; with the master switch OFF nothing is answered in
 * either mode. A call keeps the mode it was made in. A model that fails (AC-17) is in `queue-summary-failures.integration-spec.ts`.
 */
describe('the AI summary in the simulated mode, with no AI service configured (integration, real PostgreSQL)', () => {
  let internal: string;
  let design: Unit;
  let requests: AccessRequestWire[];

  beforeAll(async () => {
    await h.start({ env: { AI_SERVICE_BASE_URL: '' } });
    await h.withApprover();
    internal = await h.plan('K5');
    design = await h.unit('P-SIM');
    requests = [];
    for (const reason of REASONS) requests.push(await h.sent(design.member, internal, { businessReason: reason }));
  }, 300000);

  afterAll(async () => {
    await h.stop();
    stopCliProcesses();
  });

  // AC-16: the master switch decides before the mode does.
  it.each(['MODEL', 'SIMULATED'] as const)(
    'with the switches OFF, in %s the source and the asking are 403 AI.DISABLED and nothing is written',
    async (mode) => {
      await h.setMode(mode).expect(200);
      await h.setSwitch('AI_ACCESS_REQUEST_SUMMARY_ENABLED', 'ON').expect(200);

      expect(h.codeOf(await h.source(design.head.account).expect(403))).toBe('AI.DISABLED');
      expect(h.codeOf(await h.ask(design.head.account, 'a'.repeat(64)).expect(403))).toBe('AI.DISABLED');
      await h.setSwitch('AI_ACCESS_REQUEST_SUMMARY_ENABLED', 'OFF').expect(200);
      await h.settled();

      expect(await h.invocationCount()).toBe(0);
    },
  );

  it('MODEL with no AI service configured: 503 AI.PROVIDER_UNAVAILABLE, nothing written', async () => {
    await h.switchAll('ON');
    await h.setMode('MODEL').expect(200);
    const revision = await h.revisionOf(design.head.account);

    const response = await h.ask(design.head.account, revision).expect(503);
    await h.settled();

    expect(h.codeOf(response)).toBe('AI.PROVIDER_UNAVAILABLE');
    expect(await h.invocationCount()).toBe(0);
  });

  it('SIMULATED with no AI service configured: COMPLETED with a templated line per step, recorded SIMULATED', async () => {
    await h.switchAll('ON');
    await h.setMode('SIMULATED').expect(200);

    const view = await h.summarize(design.head.account);

    expect(view).toMatchObject({
      status: 'COMPLETED',
      errorCode: null,
      sourceStale: false,
      omittedCount: 0,
      simulated: true,
    });
    expect(view.lines.map((line) => line.requestId)).toEqual(requests.map((one) => one.id));
    const member = await h.fullNameOf(design.member.employeeId);
    view.lines.forEach((line, index) => {
      expect(line.summary).toContain(`${member} đề nghị dùng`);
      expect(line.summary).toContain(`Lý do: ${REASONS[index]}`);
    });
    expect(await h.invocationRow(view.invocationId)).toMatchObject({
      provider_mode: 'SIMULATED',
      status: 'COMPLETED',
      model_id: 'saas-sentry-simulated',
      prompt_version: 'simulated-v1',
    });
    expect((await h.aiEvents(view.invocationId)).map((event) => [event.action, event.after.providerMode])).toEqual([
      ['AI_INVOCATION.REQUESTED', 'SIMULATED'],
      ['AI_INVOCATION.COMPLETED', 'SIMULATED'],
    ]);
    expect(h.ai.calls).toHaveLength(0);
  });

  it('a SIMULATED call keeps its mode when the Super Admin sets MODEL while it runs', async () => {
    await h.switchAll('ON');
    await h.setMode('SIMULATED').expect(200);
    // A queue of its own: the revision of the head above is already kept in SIMULATED.
    const other = await h.unit('P-SIM');
    await h.sent(other.member, internal, { businessReason: 'Cần công cụ lập kế hoạch' });
    const revision = await h.revisionOf(other.head.account);

    const { invocationId } = h.dataOf<{ invocationId: string }>(await h.ask(other.head.account, revision).expect(202));
    await h.setMode('MODEL').expect(200);
    const during = h.dataOf<SummaryWire>(await h.read(other.head.account, invocationId).expect(200));
    await h.settled();

    const view = h.dataOf<SummaryWire>(await h.read(other.head.account, invocationId).expect(200));
    expect(['PENDING', 'RUNNING']).toContain(during.status);
    expect(view).toMatchObject({ status: 'COMPLETED', errorCode: null, simulated: true });
    expect(view.lines).toHaveLength(1);
    expect(await h.invocationRow(invocationId)).toMatchObject({
      provider_mode: 'SIMULATED',
      model_id: 'saas-sentry-simulated',
    });
    // The same revision asked now, in MODEL with no AI service, is refused: it never gets the simulated call back.
    expect(h.codeOf(await h.ask(other.head.account, revision).expect(503))).toBe('AI.PROVIDER_UNAVAILABLE');
    expect(h.ai.calls).toHaveLength(0);
  });
});
