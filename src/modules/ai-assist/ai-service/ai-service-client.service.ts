import {
  AiServiceAnswerInvalidError,
  AiServiceNotConfiguredError,
  AiServiceTimeoutError,
  AiServiceUnavailableError,
} from './ai-service.errors';
import {
  AiServiceClient,
  type AiServiceSettings,
  type FetchLike,
  type QueueSummaryServiceRequest,
  type QueueSummaryServiceResponse,
  SERVICE_ERROR_CODES,
  queueSummaryServiceResponseSchema,
} from './ai-service.types';

const QUEUE_SUMMARY_PATH = '/v1/summaries/access-request-queue';
/** How long the client waits before the one retry of a busy, loading or failing service (design 4.4). */
const RETRY_BACKOFF_MS = 2_000;
/** Busy (429), loading (503) and a model error (500) are tried once more; another refusal is final. */
const RETRIED_STATUSES: ReadonlySet<number> = new Set([429, 500, 503]);
const KNOWN_CODES: ReadonlySet<string> = new Set(SERVICE_ERROR_CODES);

export interface HttpAiServiceClientOptions {
  fetch?: FetchLike;
  /** Waits `ms`, or rejects when `signal` aborts first. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** The signal of one call and why it stopped: the deadline of the client, or the caller (the process stopping). */
interface Call {
  signal: AbortSignal;
  stopped(): AiServiceUnavailableError | AiServiceTimeoutError;
}

/** One try: the answer, or how it failed and whether a second try may help. */
type Attempt =
  | { kind: 'answer'; body: string }
  | { kind: 'failed'; error: AiServiceUnavailableError | AiServiceTimeoutError; retry: boolean };

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('The wait before the retry was stopped.'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new Error('The wait before the retry was stopped.'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** The code of the contract in an error body, or null: a text that is not one of the codes is never kept (it could carry data). */
function serviceCodeOf(body: string): string | null {
  try {
    const code: unknown = (JSON.parse(body) as { error?: { code?: unknown } } | null)?.error?.code;

    return typeof code === 'string' && KNOWN_CODES.has(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * The AI service over HTTP (design section 4): `POST` with the bearer token of the service and the invocation id as
 * `X-Request-Id`, the global `fetch`, and one deadline for the whole call — the retry included — so a run ends before it is taken for
 * stuck. 429, 500 and 503 and a connection that could not be made are tried once more after two seconds; any other refusal, an
 * answer outside the contract and a 504 are final. Nothing it throws carries the token, the address or a body.
 */
export class HttpAiServiceClient extends AiServiceClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;

  constructor(
    private readonly settings: AiServiceSettings | null,
    options: HttpAiServiceClientOptions = {},
  ) {
    super();
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? abortableSleep;
  }

  configured(): boolean {
    return this.settings !== null;
  }

  async summarizeQueue(request: QueueSummaryServiceRequest, signal: AbortSignal): Promise<QueueSummaryServiceResponse> {
    if (this.settings === null) throw new AiServiceNotConfiguredError();
    const timer = AbortSignal.timeout(this.settings.timeoutMs);
    const call: Call = {
      signal: AbortSignal.any([signal, timer]),
      stopped: () => (timer.aborted ? new AiServiceTimeoutError() : new AiServiceUnavailableError(null, null)),
    };
    const body = await this.post(this.settings, request, call);

    return this.answerOf(body, request.invocationId);
  }

  /** The body of a 200, after at most one retry. */
  private async post(settings: AiServiceSettings, request: QueueSummaryServiceRequest, call: Call): Promise<string> {
    let attempt = await this.attempt(settings, request, call);
    if (attempt.kind === 'failed' && attempt.retry) {
      try {
        await this.sleep(RETRY_BACKOFF_MS, call.signal);
      } catch {
        throw call.stopped();
      }
      attempt = await this.attempt(settings, request, call);
    }
    if (attempt.kind === 'failed') throw attempt.error;

    return attempt.body;
  }

  private async attempt(
    settings: AiServiceSettings,
    request: QueueSummaryServiceRequest,
    call: Call,
  ): Promise<Attempt> {
    let status: number;
    let body: string;
    try {
      const response = await this.fetchImpl(`${settings.baseUrl.replace(/\/+$/, '')}${QUEUE_SUMMARY_PATH}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${settings.token}`,
          'Content-Type': 'application/json',
          'X-Request-Id': request.invocationId,
        },
        body: JSON.stringify(request),
        signal: call.signal,
      });
      status = response.status;
      body = await response.text();
    } catch {
      // A refused connection, DNS or a reset is tried once more; the deadline or the caller stopping is final.
      if (call.signal.aborted) return { kind: 'failed', error: call.stopped(), retry: false };

      return { kind: 'failed', error: new AiServiceUnavailableError(null, null), retry: true };
    }

    return this.classify(status, body);
  }

  private classify(status: number, body: string): Attempt {
    if (status === 200) return { kind: 'answer', body };
    if (status === 504) return { kind: 'failed', error: new AiServiceTimeoutError(), retry: false };

    return {
      kind: 'failed',
      error: new AiServiceUnavailableError(status, serviceCodeOf(body)),
      retry: RETRIED_STATUSES.has(status),
    };
  }

  private answerOf(body: string, invocationId: string): QueueSummaryServiceResponse {
    let document: unknown;
    try {
      document = JSON.parse(body);
    } catch {
      throw new AiServiceAnswerInvalidError('NOT_JSON');
    }
    const answer = queueSummaryServiceResponseSchema.safeParse(document);
    if (!answer.success) throw new AiServiceAnswerInvalidError('SHAPE');
    if (answer.data.invocationId.toLowerCase() !== invocationId.toLowerCase()) {
      throw new AiServiceAnswerInvalidError('OTHER_INVOCATION');
    }

    return answer.data;
  }
}
