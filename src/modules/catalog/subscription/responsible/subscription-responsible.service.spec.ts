import { HttpException, HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { SubscriptionPoolService } from '../pool/subscription-pool.service';
import { SubscriptionNotFoundError, SubscriptionResponsibleNotItAdminError } from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import type { SubscriptionRepo } from '../subscription.repo';
import type { SubscriptionRecord, SubscriptionView } from '../subscription.types';
import type { SubscriptionViewService } from '../subscription-view.service';
import { SubscriptionResponsibleService } from './subscription-responsible.service';

describe('SubscriptionResponsibleService', () => {
  const tx = { tag: 'tx' };
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const actor = {
    subject: 'app-sa',
    appUserId: 'app-sa',
    sessionId: 'sess-1',
    employeeId: 'emp-sa',
    directRoles: ['SUPER_ADMIN'],
    roles: ['SUPER_ADMIN'],
  } as AuthenticatedPrincipal;

  const expectMappedError = (err: unknown, status: number, code: string) => {
    const mapped = toSubscriptionApiException(err) as HttpException;
    expect(mapped).toBeInstanceOf(HttpException);
    expect(mapped.getStatus()).toBe(status);
    expect(mapped.getResponse()).toMatchObject({ code });
  };

  function setup(options: {
    hasOrganization?: boolean;
    locked?: { id: string; responsibleItAdminEmployeeId: string | null } | null;
    foundAfter?: SubscriptionRecord | null;
    toIsUsableItAdmin?: boolean;
  }) {
    const view = { id: 'sub-1', responsibleItAdminEmployeeId: 'emp-it2' } as unknown as SubscriptionView;
    const subscriptions = {
      lock: jest
        .fn()
        .mockResolvedValue(
          options.locked === undefined ? { id: 'sub-1', responsibleItAdminEmployeeId: 'emp-it1' } : options.locked,
        ),
      setResponsible: jest.fn().mockResolvedValue(undefined),
      find: jest
        .fn()
        .mockResolvedValue(
          options.foundAfter === undefined ? ({ id: 'sub-1' } as SubscriptionRecord) : options.foundAfter,
        ),
    } as unknown as SubscriptionRepo;
    const poolRules = {
      isUsableItAdmin: jest.fn().mockResolvedValue(options.toIsUsableItAdmin ?? true),
    } as unknown as SubscriptionPoolService;
    const views = { viewAll: jest.fn().mockResolvedValue([view]) } as unknown as SubscriptionViewService;
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue(options.hasOrganization === false ? null : { id: 'org-1' }),
    } as unknown as OrganizationReadApi;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;

    const service = new SubscriptionResponsibleService(
      subscriptions,
      poolRules,
      views,
      organizationReads,
      audit,
      runner,
    );

    return { service, subscriptions, poolRules, views, audit, view };
  }

  it('changes the responsible IT Admin, records audit, and returns the updated view', async () => {
    const { service, subscriptions, audit, view } = setup({});

    const result = await service.change(actor, 'sub-1', { employeeId: 'emp-it2', reason: 'Handover' });

    expect(result).toEqual({ subscription: view, changed: true });
    expect((subscriptions as unknown as { setResponsible: jest.Mock }).setResponsible).toHaveBeenCalledWith(
      tx,
      'sub-1',
      'emp-it2',
    );
    expect((audit as unknown as { record: jest.Mock }).record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: 'org-1',
        action: 'SUBSCRIPTION.RESPONSIBLE_CHANGED',
        resourceType: 'Subscription',
        resourceId: 'sub-1',
        before: { responsibleItAdminEmployeeId: 'emp-it1' },
        after: { responsibleItAdminEmployeeId: 'emp-it2', reason: 'Handover' },
      }),
    );
  });

  it('returns changed: false without writing or auditing when the named IT Admin already answers for it', async () => {
    const { service, subscriptions, audit, view } = setup({});

    const result = await service.change(actor, 'sub-1', { employeeId: 'emp-it1', reason: 'Same person' });

    expect(result).toEqual({ subscription: view, changed: false });
    expect((subscriptions as unknown as { setResponsible: jest.Mock }).setResponsible).not.toHaveBeenCalled();
    expect((audit as unknown as { record: jest.Mock }).record).not.toHaveBeenCalled();
  });

  it('throws SubscriptionNotFoundError (404 SUBSCRIPTION.NOT_FOUND) when the subscription does not exist', async () => {
    const { service, subscriptions, audit } = setup({ locked: null });

    let caught: unknown;
    try {
      await service.change(actor, 'missing-sub', { employeeId: 'emp-it2', reason: 'Handover' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SubscriptionNotFoundError);
    expectMappedError(caught, HttpStatus.NOT_FOUND, 'SUBSCRIPTION.NOT_FOUND');
    expect((subscriptions as unknown as { setResponsible: jest.Mock }).setResponsible).not.toHaveBeenCalled();
    expect((audit as unknown as { record: jest.Mock }).record).not.toHaveBeenCalled();
  });

  it('throws SubscriptionResponsibleNotItAdminError (422 SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN) when the nominee is not a usable IT Admin', async () => {
    const { service, subscriptions, audit } = setup({ toIsUsableItAdmin: false });

    let caught: unknown;
    try {
      await service.change(actor, 'sub-1', { employeeId: 'emp-user', reason: 'Not IT' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SubscriptionResponsibleNotItAdminError);
    expectMappedError(caught, HttpStatus.UNPROCESSABLE_ENTITY, 'SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN');
    expect((subscriptions as unknown as { setResponsible: jest.Mock }).setResponsible).not.toHaveBeenCalled();
    expect((audit as unknown as { record: jest.Mock }).record).not.toHaveBeenCalled();
  });

  it('fails fast before entering a transaction when the organization is not installed', async () => {
    const { service, subscriptions } = setup({ hasOrganization: false });

    await expect(service.change(actor, 'sub-1', { employeeId: 'emp-it2', reason: 'Handover' })).rejects.toThrow(
      'The subscriptions were used before installation',
    );
    expect((subscriptions as unknown as { lock: jest.Mock }).lock).not.toHaveBeenCalled();
  });
});
