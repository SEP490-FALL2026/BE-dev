import { validateQueueSummary } from '../queue-summary/queue-summary-output.policy';
import { AiServiceUnavailableError } from './ai-service.errors';
import { SIMULATED_DELAY_MS, SimulatedAiServiceClient } from './ai-service-simulated-client.service';
import {
  QUEUE_MAX_REQUESTS,
  type QueueRequestItem,
  type QueueSummaryServiceRequest,
  queueSummaryServiceResponseSchema,
} from './ai-service.types';

const INVOCATION = '0b7c4a7e-5d0e-4c8e-9c0a-3f1d2a9b8c11';

/** A small deterministic generator, so a failing context can be found again from its seed. */
function randomOf(seed: number): (below: number) => number {
  let state = seed >>> 0;

  return (below) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state % below;
  };
}

/** Words of real queues that hold no advice, decision, claim or unit the checks of the backend refuse. */
const WORDS = [
  'thiết kế',
  'giao diện',
  'dự án',
  'báo cáo',
  'quý',
  'khách hàng',
  'tài liệu',
  'kiểm thử',
  'nhóm',
  'phòng',
];
const SOFTWARE = [
  'Figma Professional',
  'Jira Software',
  'Office 365',
  'Miro',
  'Notion',
  'Zoom Pro',
  'Adobe Photoshop 2026',
];
const PEOPLE = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Hoàng 😀 Phúc', 'Phạm Minh Đức', 'Võ Thị Thu Hà'];

function textOf(pick: (below: number) => number, size: number): string {
  const words: string[] = [];
  while ([...words.join(' ')].length < size) {
    words.push(pick(4) === 0 ? String(pick(100_000)) : WORDS[pick(WORDS.length)]);
  }

  return [...words.join(' ')].slice(0, size).join('').trim();
}

function randomRequest(seed: number): QueueSummaryServiceRequest {
  const pick = randomOf(seed);
  const requests: QueueRequestItem[] = Array.from({ length: pick(QUEUE_MAX_REQUESTS + 1) }, (_, index) => {
    const spend = pick(2) === 0;
    const longNames = pick(5) === 0;

    return {
      sourceRef: `R${String(index + 1).padStart(3, '0')}`,
      stepKind: spend ? 'SPEND_APPROVAL' : 'NEED_APPROVAL',
      softwareName: longNames ? textOf(pick, 120) : SOFTWARE[pick(SOFTWARE.length)],
      beneficiaryDisplayName: longNames ? textOf(pick, 120) : PEOPLE[pick(PEOPLE.length)],
      reason: textOf(pick, [0, 40, 400, 1000][pick(4)]),
      requestedDurationLabel: pick(3) === 0 ? null : `${1 + pick(36)} tháng`,
      estimatedCostRef: spend && pick(3) !== 0 ? `C${String(index + 1).padStart(3, '0')}` : null,
    };
  });

  return {
    contractVersion: '1',
    invocationId: INVOCATION,
    locale: 'vi',
    context: { generatedAt: '2026-11-20T03:15:00.000Z', requests },
  };
}

/** A client that does not wait, and a clock that reads `times` in turn. */
function instantClient(...times: number[]) {
  const sleep = jest.fn<Promise<void>, [number, AbortSignal]>(() => Promise.resolve());
  const clock = [...times];
  const client = new SimulatedAiServiceClient({ sleep, now: () => clock.shift() ?? 0 });

  return { client, sleep };
}

describe('SimulatedAiServiceClient (the simulated source of answers)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('is always configured: it needs no address and no token', () => {
    expect(new SimulatedAiServiceClient().configured()).toBe(true);
  });

  it('waits a second and a half, so the call is seen running, then answers with the time taken in whole milliseconds', async () => {
    const { client, sleep } = instantClient(1000, 2503.6);
    const signal = new AbortController().signal;

    const answer = await client.summarizeQueue(randomRequest(1), signal);

    expect(SIMULATED_DELAY_MS).toBe(1500);
    expect(sleep).toHaveBeenCalledWith(1500, signal);
    expect(answer.latencyMs).toBe(1504);
    expect(Number.isInteger(answer.latencyMs)).toBe(true);
  });

  it('answers every valid context in the shape of the contract, with lines the checks of the backend all keep', async () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const request = randomRequest(seed);
      const { client } = instantClient(0, 1);

      const answer = await client.summarizeQueue(request, new AbortController().signal);

      expect({ seed, parsed: queueSummaryServiceResponseSchema.safeParse(answer).success }).toEqual({
        seed,
        parsed: true,
      });
      expect(answer.invocationId).toBe(INVOCATION);
      expect(answer.parsed?.items.map((line) => line.sourceRef)).toEqual(
        request.context.requests.map((step) => step.sourceRef),
      );
      expect({
        seed,
        rejections: validateQueueSummary(request.context, answer.parsed ?? { items: [] }).rejections,
      }).toEqual({ seed, rejections: [] });
    }
  });

  it('gives no answer when the call is stopped before it starts, with the error the run reads as unavailable', async () => {
    const controller = new AbortController();
    controller.abort();

    const call = new SimulatedAiServiceClient().summarizeQueue(randomRequest(2), controller.signal);

    await expect(call).rejects.toBeInstanceOf(AiServiceUnavailableError);
    await expect(call).rejects.toMatchObject({ status: null, serviceCode: null });
  });

  it('gives no answer when the call is stopped while it waits, and stops waiting at once', async () => {
    const controller = new AbortController();
    const started = performance.now();
    setTimeout(() => controller.abort(), 20);

    const call = new SimulatedAiServiceClient().summarizeQueue(randomRequest(3), controller.signal);

    await expect(call).rejects.toEqual(new AiServiceUnavailableError(null, null));
    expect(performance.now() - started).toBeLessThan(SIMULATED_DELAY_MS);
  });

  it('gives no answer when the call is stopped just as the wait ends', async () => {
    const controller = new AbortController();
    const client = new SimulatedAiServiceClient({
      sleep: () => {
        controller.abort();

        return Promise.resolve();
      },
    });

    await expect(client.summarizeQueue(randomRequest(4), controller.signal)).rejects.toBeInstanceOf(
      AiServiceUnavailableError,
    );
  });

  it('really waits the delay when nothing is injected, and records it as a whole number', async () => {
    const answer = await new SimulatedAiServiceClient().summarizeQueue(randomRequest(5), new AbortController().signal);

    expect(Number.isInteger(answer.latencyMs)).toBe(true);
    expect(answer.latencyMs).toBeGreaterThanOrEqual(SIMULATED_DELAY_MS - 10);
    expect(answer.latencyMs).toBeLessThan(SIMULATED_DELAY_MS + 1000);
  });
});
