import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { AuditEventInput } from '../../audit/public/audit.types';
import type { AiInvocationContentRepo } from '../invocation/invocation-content.repo';
import type { InvocationContentRecord } from '../invocation/invocation.types';
import { InvocationContentNotFoundError } from './invocation-content.errors';
import { InvocationContentQueryService } from './invocation-content-query.service';

const TX = { fake: 'transaction' } as unknown as DbTx;
const INVOCATION_ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const ORGANIZATION_ID = '0a000000-0000-4000-8000-000000000001';
const ADMIN = {
  subject: 'admin',
  appUserId: 'b0000000-0000-4000-8000-000000000001',
  sessionId: 'session-1',
  employeeId: 'e0000000-0000-4000-8000-000000000001',
  directRoles: ['SUPER_ADMIN'],
  roles: ['SUPER_ADMIN'],
} as unknown as AuthenticatedPrincipal;

const RECORD: InvocationContentRecord = {
  invocationId: INVOCATION_ID,
  organizationId: ORGANIZATION_ID,
  providerMode: 'MODEL',
  context: { generatedAt: '2026-11-04T09:00:00.000Z', requests: [] },
  promptText: 'the prompt',
  rawResponse: '{"items":[]}',
  parsed: { items: [] },
  result: { total: 0, steps: [], accepted: [], rejections: [] },
};

function world(found: InvocationContentRecord | null = RECORD) {
  const order: string[] = [];
  const events: AuditEventInput[] = [];
  const repo = {
    find: jest.fn<Promise<InvocationContentRecord | null>, [DbTx, string]>(() => {
      order.push('read');
      return Promise.resolve(found);
    }),
  };
  const audit = {
    record: jest.fn((_tx: DbTx, event: AuditEventInput) => {
      order.push('audit');
      events.push(event);
      return Promise.resolve();
    }),
  };
  const run = jest.fn(<T>(work: (tx: DbTx) => Promise<T>) => work(TX));
  const service = new InvocationContentQueryService(
    { run } as unknown as TransactionRunner,
    repo as unknown as AiInvocationContentRepo,
    audit as unknown as AuditApi,
  );

  return { service, repo, audit, run, events, order };
}

describe('InvocationContentQueryService.read', () => {
  it('gives the content as it is stored, with the id of the call', async () => {
    const { service } = world();

    await expect(service.read(ADMIN, INVOCATION_ID)).resolves.toEqual({
      invocationId: INVOCATION_ID,
      providerMode: 'MODEL',
      context: RECORD.context,
      promptText: 'the prompt',
      rawResponse: '{"items":[]}',
      parsed: { items: [] },
      result: RECORD.result,
    });
  });

  it('gives the mode the call was made in, so a simulated answer is never read as one of the model', async () => {
    const { service } = world({ ...RECORD, providerMode: 'SIMULATED' });

    await expect(service.read(ADMIN, INVOCATION_ID)).resolves.toMatchObject({ providerMode: 'SIMULATED' });
  });

  it('keeps the fields the table lets be empty as null', async () => {
    const { service } = world({ ...RECORD, promptText: null, rawResponse: null, parsed: null, result: null });

    await expect(service.read(ADMIN, INVOCATION_ID)).resolves.toMatchObject({
      promptText: null,
      rawResponse: null,
      parsed: null,
      result: null,
    });
  });

  it('writes one AI_INVOCATION.CONTENT_READ event per read, carrying the invocation id and no content, in the transaction of the read', async () => {
    const { service, repo, audit, events, order, run } = world();

    await service.read(ADMIN, INVOCATION_ID);

    expect(run).toHaveBeenCalledTimes(1);
    expect(repo.find).toHaveBeenCalledWith(TX, INVOCATION_ID);
    expect(audit.record).toHaveBeenCalledWith(TX, expect.anything());
    expect(order).toEqual(['read', 'audit']);
    expect(events).toEqual([
      {
        organizationId: ORGANIZATION_ID,
        actorKind: 'USER',
        actorAppUserId: ADMIN.appUserId,
        actorRoles: ['SUPER_ADMIN'],
        action: 'AI_INVOCATION.CONTENT_READ',
        resourceType: 'AiInvocation',
        resourceId: INVOCATION_ID,
        after: { invocationId: INVOCATION_ID },
        correlationId: 'session-1',
      },
    ]);
    const payload = JSON.stringify(events[0]);
    for (const content of ['the prompt', '{\\"items\\"', 'generatedAt']) expect(payload).not.toContain(content);
  });

  it('writes an event on every read, the same call read twice included', async () => {
    const { service, events } = world();

    await service.read(ADMIN, INVOCATION_ID);
    await service.read(ADMIN, INVOCATION_ID);

    expect(events).toHaveLength(2);
  });

  it('refuses with a not-found error, and no event, when there is no content for the id (never made, or purged)', async () => {
    const { service, audit } = world(null);

    await expect(service.read(ADMIN, INVOCATION_ID)).rejects.toThrow(InvocationContentNotFoundError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a UUID the same way, without reading', async () => {
    const { service, repo, run } = world();

    await expect(service.read(ADMIN, 'not-an-id')).rejects.toThrow(InvocationContentNotFoundError);
    expect(repo.find).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('gives nothing back when the event cannot be written: the read is not answered unrecorded', async () => {
    const { service, audit } = world();
    audit.record.mockRejectedValueOnce(new Error('audit failed'));

    await expect(service.read(ADMIN, INVOCATION_ID)).rejects.toThrow('audit failed');
  });
});
