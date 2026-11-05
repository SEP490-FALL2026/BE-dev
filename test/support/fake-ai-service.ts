import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in of the AI service (contract v1, `AI-dev/src/ai_service/contract.py` and `app.py`) on a local `node:http` server: the
 * application under test calls it over real HTTP through the global `fetch`, exactly as it calls the real service. It checks the
 * bearer token of the service, records every call (headers and body, so a spec reads exactly what the backend sent) and answers
 * what the spec scripted: an answer of the model, an error status, a body that is not JSON, no answer at all, or a dropped
 * connection. Port 0: the system chooses the port.
 */

export const QUEUE_SUMMARY_PATH = '/v1/summaries/access-request-queue';

/** A line the scripted model writes. */
export interface ScriptedItem {
  sourceRef: string;
  stepKind: string;
  summary: string;
}

/** The context item of the contract, as the backend sent it. */
export interface SentItem {
  sourceRef: string;
  stepKind: 'NEED_APPROVAL' | 'SPEND_APPROVAL';
  softwareName: string;
  beneficiaryDisplayName: string;
  reason: string;
  requestedDurationLabel: string | null;
  estimatedCostRef: string | null;
}

/** The body of `POST /v1/summaries/access-request-queue`, as the backend sent it. */
export interface SentBody {
  contractVersion: string;
  invocationId: string;
  locale: string;
  context: { generatedAt: string; requests: SentItem[] };
}

/** One call the stand-in received. */
export interface RecordedCall {
  method: string;
  path: string;
  authorization: string | undefined;
  requestId: string | undefined;
  contentType: string | undefined;
  /** False when the bearer token was wrong or missing: the call was refused with 401, as the real service refuses it. */
  authorized: boolean;
  /** The body exactly as it arrived. */
  raw: string;
  body: SentBody;
}

/** What the stand-in does with an authorised call. */
export type FakeReply =
  | { kind: 'answer'; items: ScriptedItem[] | null; parseStatus?: 'OK' | 'INVALID_JSON' | 'SCHEMA_MISMATCH' }
  | { kind: 'status'; status: number; code: string }
  | { kind: 'body'; status: number; body: string }
  | { kind: 'hang' }
  | { kind: 'reset' };

export type Script = (call: RecordedCall) => FakeReply;

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  UNAUTHORIZED: 'Unauthorized',
  BUSY: 'Model is busy',
  MODEL_LOADING: 'Model is loading',
  MODEL_ERROR: 'Model error',
  MODEL_TIMEOUT: 'Model timed out',
};

const KIND_LABEL: Readonly<Record<string, string>> = { NEED_APPROVAL: 'Duyệt nhu cầu', SPEND_APPROVAL: 'Duyệt chi' };

/** The line a well-behaved model writes for an item: its kind, the software, the person and the reason, and the cost placeholder. */
export function faithfulLine(item: SentItem): ScriptedItem {
  const cost = item.estimatedCostRef === null ? '' : ` Chi phí ước tính {{cost:${item.estimatedCostRef}}}.`;

  return {
    sourceRef: item.sourceRef,
    stepKind: item.stepKind,
    summary: `${KIND_LABEL[item.stepKind]}: ${item.softwareName} cho ${item.beneficiaryDisplayName}. Lý do: ${item.reason}.${cost}`,
  };
}

/** A faithful line for every item sent, with `change` applied to the item it names. */
export function faithfulAnswer(
  call: RecordedCall,
  change: (item: SentItem, line: ScriptedItem) => ScriptedItem[] = (_, l) => [l],
): FakeReply {
  return { kind: 'answer', items: call.body.context.requests.flatMap((item) => change(item, faithfulLine(item))) };
}

export class FakeAiService {
  /** The bearer token of the service in this test: a fixed test value, not a secret. */
  readonly token = 'test-only-ai-service-token';
  readonly calls: RecordedCall[] = [];
  private script: Script = (call) => faithfulAnswer(call);
  private server: Server | null = null;
  private readonly held = new Set<ServerResponse>();
  private readonly waiting: Array<(call: RecordedCall) => void> = [];
  private baseUrl = '';

  /** Resolves with the next call the stand-in receives: a spec waits on it instead of sleeping. */
  nextCall(): Promise<RecordedCall> {
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /** Listens on a port the system chooses and gives the base URL. */
  async start(): Promise<string> {
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    this.server = server;
    this.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    return this.baseUrl;
  }

  /** The environment that points the application at this stand-in. */
  environment(timeoutMs: number): Record<string, string> {
    return {
      AI_SERVICE_BASE_URL: this.baseUrl,
      AI_SERVICE_TOKEN: this.token,
      AI_SERVICE_TIMEOUT_MS: String(timeoutMs),
    };
  }

  /** What the next calls are answered with, until it is changed again. */
  reply(script: Script): void {
    this.script = script;
  }

  /** Back to a faithful model, with no call recorded. */
  reset(): void {
    this.script = (call) => faithfulAnswer(call);
    this.calls.length = 0;
    this.release();
  }

  /** The calls the stand-in accepted (right token, right route). */
  accepted(): RecordedCall[] {
    return this.calls.filter((call) => call.authorized && call.path === QUEUE_SUMMARY_PATH && call.method === 'POST');
  }

  /** Ends every call held without an answer (`hang`). */
  release(): void {
    for (const response of this.held) response.destroy();
    this.held.clear();
  }

  async stop(): Promise<void> {
    this.release();
    const server = this.server;
    if (server === null) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.server = null;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body: SentBody;
    try {
      body = JSON.parse(raw) as SentBody;
    } catch {
      body = { contractVersion: '', invocationId: '', locale: '', context: { generatedAt: '', requests: [] } };
    }
    const header = (name: string) => {
      const value = request.headers[name];

      return Array.isArray(value) ? value.join(',') : value;
    };
    const call: RecordedCall = {
      method: request.method ?? '',
      path: request.url ?? '',
      authorization: header('authorization'),
      requestId: header('x-request-id'),
      contentType: header('content-type'),
      authorized: header('authorization') === `Bearer ${this.token}`,
      raw,
      body,
    };
    this.calls.push(call);
    for (const resolve of this.waiting.splice(0)) resolve(call);
    if (call.method !== 'POST' || call.path !== QUEUE_SUMMARY_PATH) {
      this.send(response, 404, JSON.stringify({ detail: 'Not Found' }));
      return;
    }
    if (!call.authorized) {
      this.sendError(response, 401, 'UNAUTHORIZED');
      return;
    }
    this.answer(call, this.script(call), response);
  }

  private answer(call: RecordedCall, reply: FakeReply, response: ServerResponse): void {
    switch (reply.kind) {
      case 'hang':
        this.held.add(response);
        response.on('close', () => this.held.delete(response));
        return;
      case 'reset':
        response.socket?.destroy();
        return;
      case 'status':
        this.sendError(response, reply.status, reply.code);
        return;
      case 'body':
        this.send(response, reply.status, reply.body);
        return;
      case 'answer': {
        const parseStatus = reply.parseStatus ?? (reply.items === null ? 'INVALID_JSON' : 'OK');
        const parsed = parseStatus === 'OK' && reply.items !== null ? { items: reply.items } : null;
        this.send(
          response,
          200,
          JSON.stringify({
            contractVersion: '1',
            invocationId: call.body.invocationId,
            modelId: 'fake-model',
            modelRevision: 'fake-rev-1',
            promptVersion: 'access-request-queue-summary-v1',
            schemaVersion: 'access-request-queue-summary.v1',
            promptText: `PROMPT ${JSON.stringify(call.body.context)}`,
            rawResponse: JSON.stringify(reply.items ?? 'not json'),
            parsed,
            parseStatus,
            usage: { promptTokens: 100, completionTokens: 20 },
            latencyMs: 12,
          }),
        );
        return;
      }
    }
  }

  private sendError(response: ServerResponse, status: number, code: string): void {
    this.send(response, status, JSON.stringify({ error: { code, message: ERROR_MESSAGES[code] ?? code } }));
  }

  private send(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(body);
  }
}
