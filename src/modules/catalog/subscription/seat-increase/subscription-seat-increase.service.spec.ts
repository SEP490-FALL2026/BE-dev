import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionSeatIncreaseService, type SeatIncrease } from './subscription-seat-increase.service';

interface NoticeCall {
  organizationId: string;
  recipientEmployeeId: string;
  code: string;
  subject: { type: string; id: string };
  params: Record<string, unknown>;
  eventKey: string;
}

const actorOf = (employeeId: string): AuthenticatedPrincipal => ({
  subject: `app-${employeeId}`,
  appUserId: `app-${employeeId}`,
  sessionId: 'sess-1',
  employeeId,
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
});

const baseInput = (overrides: Partial<SeatIncrease> = {}): SeatIncrease => ({
  organizationId: 'org-1',
  subscriptionId: 'sub-1',
  planProvisioningType: 'K2',
  status: 'ACTIVE',
  responsibleItAdminEmployeeId: 'emp-it1',
  from: 5,
  to: 8,
  requestId: null,
  actor: actorOf('emp-it2'),
  ...overrides,
});

function harness(options: { usableIds?: string[]; superAdminId?: string | null; financeId?: string | null }) {
  const tx = { tag: 'tx' } as unknown as DbTx;
  const notifyInApp = jest.fn<Promise<boolean>, [DbTx, NoticeCall]>().mockResolvedValue(true);
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(options.usableIds ?? [])),
    findUsableSuperAdminEmployeeId: jest
      .fn()
      .mockResolvedValue(options.superAdminId === undefined ? 'emp-sa' : options.superAdminId),
    findUsableFinanceEmployeeId: jest
      .fn()
      .mockResolvedValue(options.financeId === undefined ? 'emp-fin' : options.financeId),
  };

  const service = new SubscriptionSeatIncreaseService({ notifyInApp } as never, identity as never);

  return { tx, service, notifyInApp, identity };
}

describe('SubscriptionSeatIncreaseService', () => {
  it('notifies usable responsible IT Admin when someone else increased seats', async () => {
    const { tx, service, notifyInApp, identity } = harness({ usableIds: ['emp-it1'] });

    const count = await service.told(tx, baseInput());

    expect(count).toBe(1);
    expect(identity.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['emp-it1'], tx);
    expect(identity.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifyInApp.mock.calls[0][1]).toMatchObject({
      recipientEmployeeId: 'emp-it1',
      code: 'SUBSCRIPTION_SEATS_INCREASED',
      params: { subscriptionId: 'sub-1', fromQuantity: 5, toQuantity: 8, changedByEmployeeId: 'emp-it2' },
    });
  });

  it('notifies nobody when actor is the usable responsible IT Admin', async () => {
    const { tx, service, notifyInApp } = harness({ usableIds: ['emp-it1'] });

    const count = await service.told(tx, baseInput({ actor: actorOf('emp-it1') }));

    expect(count).toBe(0);
    expect(notifyInApp).not.toHaveBeenCalled();
  });

  it('falls back to Super Admin when responsible IT Admin is unusable or null', async () => {
    const unusable = harness({ usableIds: [], superAdminId: 'emp-sa' });
    expect(await unusable.service.told(unusable.tx, baseInput())).toBe(1);
    expect(unusable.identity.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(unusable.tx);
    expect(unusable.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);

    const nullResp = harness({ superAdminId: 'emp-sa' });
    expect(await nullResp.service.told(nullResp.tx, baseInput({ responsibleItAdminEmployeeId: null }))).toBe(1);
    expect(nullResp.identity.findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
    expect(nullResp.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);
  });

  it('notifies nobody when falling back to Super Admin and Super Admin is the actor', async () => {
    const { tx, service, notifyInApp } = harness({ usableIds: [], superAdminId: 'emp-sa' });

    const count = await service.told(tx, baseInput({ responsibleItAdminEmployeeId: null, actor: actorOf('emp-sa') }));

    expect(count).toBe(0);
    expect(notifyInApp).not.toHaveBeenCalled();
  });

  it('returns 0 and skips lookups for non-owed increases (K1 or DRAFT)', async () => {
    const k1 = harness({ usableIds: ['emp-it1'] });
    expect(await k1.service.told(k1.tx, baseInput({ planProvisioningType: 'K1' }))).toBe(0);
    expect(k1.notifyInApp).not.toHaveBeenCalled();

    const draft = harness({ usableIds: ['emp-it1'] });
    expect(await draft.service.told(draft.tx, baseInput({ status: 'DRAFT' }))).toBe(0);
    expect(draft.notifyInApp).not.toHaveBeenCalled();
  });

  it('W3-03: toldReduction notifies R1 + Finance with SUBSCRIPTION_SEATS_REDUCED and ISO timestamp eventKey', async () => {
    const { tx, service, notifyInApp } = harness({ usableIds: ['emp-khoa'], financeId: 'emp-fin' });
    const updatedAt = new Date('2026-11-25T10:00:00.000Z');

    const count = await service.toldReduction(tx, {
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      planProvisioningType: 'K2',
      status: 'ACTIVE',
      responsibleItAdminEmployeeId: 'emp-khoa',
      from: 12,
      to: 11,
      updatedAt,
      actor: actorOf('emp-nam'),
    });

    expect(count).toBe(2);
    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-khoa', 'emp-fin']);
    expect(notifyInApp.mock.calls[0][1]).toMatchObject({
      code: 'SUBSCRIPTION_SEATS_REDUCED',
      subject: { type: 'SUBSCRIPTION', id: 'sub-1' },
      params: { subscriptionId: 'sub-1', fromQuantity: 12, toQuantity: 11, changedByEmployeeId: 'emp-nam' },
      eventKey: 'SUBSCRIPTION_SEATS_REDUCED:sub-1:2026-11-25T10:00:00.000Z',
    });
  });
});
