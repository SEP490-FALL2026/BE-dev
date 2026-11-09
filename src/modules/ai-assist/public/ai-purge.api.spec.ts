import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { AuditEventInput } from '../../audit/public/audit.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AiInvocationContentRepo } from '../invocation/invocation-content.repo';
import { AiPurgeApi } from './ai-purge.api';
import { AiPurgeRefusedError } from './ai-purge.errors';

const TX = { fake: 'transaction' } as unknown as DbTx;
const ORGANIZATION_ID = '0a000000-0000-4000-8000-000000000001';

function world(options: { count?: number; organization?: boolean } = {}) {
  const count = options.count ?? 3;
  const order: string[] = [];
  const events: AuditEventInput[] = [];
  const repo = {
    countCreatedBefore: jest.fn<Promise<number>, [Date, DbTx?]>(() => Promise.resolve(count)),
    deleteCreatedBefore: jest.fn<Promise<number>, [DbTx, Date]>(() => {
      order.push('delete');
      return Promise.resolve(count);
    }),
  };
  const audit = {
    record: jest.fn((_tx: DbTx, event: AuditEventInput) => {
      order.push('audit');
      events.push(event);
      return Promise.resolve();
    }),
  };
  const organizations = {
    getOrganization: jest.fn(() => Promise.resolve(options.organization === false ? null : { id: ORGANIZATION_ID })),
  };
  const run = jest.fn(<T>(work: (tx: DbTx) => Promise<T>) => work(TX));
  const api = new AiPurgeApi(
    { run } as unknown as TransactionRunner,
    repo as unknown as AiInvocationContentRepo,
    organizations as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
  );

  return { api, repo, audit, organizations, run, events, order };
}

describe('AiPurgeApi.purge', () => {
  describe('a dry run', () => {
    it('counts what the cut-off would delete, and writes nothing: no delete, no audit, no transaction', async () => {
      const { api, repo, audit, run } = world({ count: 7 });

      await expect(api.purge({ through: '2026-12-01', apply: false, operator: null })).resolves.toEqual({
        mode: 'DRY_RUN',
        through: '2026-12-01',
        contentCount: 7,
      });
      expect(repo.deleteCreatedBefore).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    });

    it('counts the rows created before the start of the day after --through (UTC): the whole of that day is in', async () => {
      const { api, repo } = world();

      await api.purge({ through: '2026-12-31', apply: false, operator: null });

      expect(repo.countCreatedBefore).toHaveBeenCalledWith(new Date('2027-01-01T00:00:00.000Z'));
    });
  });

  describe('with --apply', () => {
    const command = { through: '2026-12-01', apply: true, operator: 'ops-lead' } as const;

    it('deletes the contents and writes AI_INVOCATION.PURGED as the operator, in the same transaction, after the delete', async () => {
      const { api, repo, audit, events, order, run } = world({ count: 4 });

      await expect(api.purge(command)).resolves.toEqual({ mode: 'APPLIED', through: '2026-12-01', contentCount: 4 });

      expect(run).toHaveBeenCalledTimes(1);
      expect(repo.deleteCreatedBefore).toHaveBeenCalledWith(TX, new Date('2026-12-02T00:00:00.000Z'));
      expect(audit.record).toHaveBeenCalledWith(TX, expect.anything());
      expect(order).toEqual(['delete', 'audit']);
      expect(events).toEqual([
        {
          organizationId: ORGANIZATION_ID,
          actorKind: 'OPERATOR',
          actorAppUserId: null,
          actorRoles: [],
          action: 'AI_INVOCATION.PURGED',
          resourceType: 'AiInvocationContent',
          resourceId: '2026-12-01',
          after: { deletedCount: 4, through: '2026-12-01' },
          correlationId: expect.any(String) as unknown,
          operatorReference: 'ops-lead',
        },
      ]);
    });

    it('writes no event when there was nothing to delete', async () => {
      const { api, audit } = world({ count: 0 });

      await expect(api.purge(command)).resolves.toEqual({ mode: 'APPLIED', through: '2026-12-01', contentCount: 0 });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rolls the delete back, by failing, when the event cannot be written', async () => {
      const { api, audit } = world();
      audit.record.mockRejectedValueOnce(new Error('audit failed'));

      await expect(api.purge(command)).rejects.toThrow('audit failed');
    });

    it('refuses, by an error of its own, an installation with no organization: nobody to record the deletion under', async () => {
      const { api } = world({ organization: false });

      await expect(api.purge(command)).rejects.toThrow(AiPurgeRefusedError);
    });

    it('refuses to apply for no operator', async () => {
      const { api, repo } = world();

      await expect(api.purge({ through: '2026-12-01', apply: true, operator: null })).rejects.toThrow(
        AiPurgeRefusedError,
      );
      expect(repo.deleteCreatedBefore).not.toHaveBeenCalled();
    });
  });
});
