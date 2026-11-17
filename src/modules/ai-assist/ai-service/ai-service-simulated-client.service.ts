import { setTimeout as delay } from 'node:timers/promises';
import { AiServiceUnavailableError } from './ai-service.errors';
import { simulatedQueueAnswer } from './ai-service-simulated.policy';
import { AiServiceClient, type QueueSummaryServiceRequest, type QueueSummaryServiceResponse } from './ai-service.types';

/** How long the simulation waits before it answers, so the screen shows the call running as it would with a model. */
export const SIMULATED_DELAY_MS = 1_500;

export interface SimulatedAiServiceClientOptions {
  /** Waits `ms`, or rejects when `signal` aborts first. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** A clock in milliseconds, for the time a call took. */
  now?: () => number;
}

const abortableDelay = (ms: number, signal: AbortSignal): Promise<void> => delay(ms, undefined, { signal });

/**
 * The simulated source of answers, chosen when the Super Admin sets `AI_PROVIDER_MODE` to `SIMULATED`: it calls no model and
 * nothing on the network, waits a moment, then writes one templated line per step of the context
 * (`ai-service-simulated.policy.ts`). The answer has the shape of the contract and goes through the same checks as an answer of
 * the model. It is never used in place of a model that failed, and it logs nothing of what it writes.
 */
export class SimulatedAiServiceClient extends AiServiceClient {
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly now: () => number;

  constructor(options: SimulatedAiServiceClientOptions = {}) {
    super();
    this.sleep = options.sleep ?? abortableDelay;
    this.now = options.now ?? (() => performance.now());
  }

  configured(): boolean {
    return true;
  }

  /**
   * One simulated summary. A call stopped before it answers (the process stopping) gives no answer and throws the error the run
   * reads as an unavailable service, as a stopped call to the model does.
   */
  async summarizeQueue(request: QueueSummaryServiceRequest, signal: AbortSignal): Promise<QueueSummaryServiceResponse> {
    const started = this.now();
    try {
      await this.sleep(SIMULATED_DELAY_MS, signal);
    } catch {
      throw new AiServiceUnavailableError(null, null);
    }
    if (signal.aborted) throw new AiServiceUnavailableError(null, null);

    return simulatedQueueAnswer(request, this.now() - started);
  }
}
