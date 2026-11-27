import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../../notifications/public/notifications.api';
import type { SeatPurchaseRepo } from './seat-purchase.repo';
import { SeatPurchaseService } from './seat-purchase.service';

const actor = (employeeId: string): AuthenticatedPrincipal => ({
  subject: `user-${employeeId}`,
  appUserId: `user-${employeeId}`,
  employeeId,
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
});

describe('SeatPurchaseService (W3-18)', () => {
  function build(options: { responsibleUsable?: boolean; superAdmin?: string | null } = {}) {
    const tx = {} as DbTx;
    const insert = jest.fn().mockResolvedValue({
      id: 'purchase-1',
      organizationId: 'org-1',
      subscriptionLineId: 'line-1',
      code: 'MUA-000001',
      kind: 'TOP_UP',
      purchasedOn: '2026-11-21',
      quantity: 2,
      invoiceObligation: 'WORKING_DAYS',
      invoiceDueOn: '2026-11-27',
      recordedByEmployeeId: 'it-actor',
      recordedAt: new Date('2026-11-21T08:00:00.000Z'),
    });
    const repo = {
      insert,
      find: jest.fn(),
      ofLine: jest.fn(),
      awaitingInvoice: jest.fn(),
    } as unknown as SeatPurchaseRepo;
    const findUsableSuperAdminEmployeeId = jest.fn().mockResolvedValue(options.superAdmin ?? 'sa-1');
    const identity = {
      findUsableItAdminEmployeeIds: jest
        .fn()
        .mockResolvedValue(options.responsibleUsable === false ? new Set() : new Set(['it-resp'])),
      findUsableSuperAdminEmployeeId,
    } as unknown as IdentityAccessApi;
    const notifyInApp = jest.fn().mockResolvedValue(true);
    const notifications = { notifyInApp } as unknown as NotificationsApi;

    return {
      tx,
      repo,
      findUsableSuperAdminEmployeeId,
      notifyInApp,
      service: new SeatPurchaseService(repo, identity, notifications),
    };
  }

  it('notifies responsible IT admin when usable and different from actor via SUBSCRIPTION_SEATS_BOUGHT', async () => {
    const { tx, notifyInApp, service } = build();

    await service.notifySeatsBought(tx, {
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      subscriptionLineId: 'line-1',
      seatPurchaseId: 'purchase-1',
      quantity: 2,
      responsibleItAdminEmployeeId: 'it-resp',
      actor: actor('it-actor'),
    });

    expect(notifyInApp).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'it-resp',
      code: 'SUBSCRIPTION_SEATS_BOUGHT',
      subject: { type: 'SUBSCRIPTION', id: 'sub-1' },
      params: {
        subscriptionId: 'sub-1',
        subscriptionLineId: 'line-1',
        seatPurchaseId: 'purchase-1',
        quantity: 2,
        recordedByEmployeeId: 'it-actor',
      },
      eventKey: 'SUBSCRIPTION_SEATS_BOUGHT:purchase-1',
    });
  });

  it('falls back to usable Super Admin when responsible IT admin is unusable or missing', async () => {
    const { tx, notifyInApp, findUsableSuperAdminEmployeeId, service } = build({
      responsibleUsable: false,
      superAdmin: 'sa-1',
    });

    await service.notifySeatsBought(tx, {
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      subscriptionLineId: 'line-1',
      seatPurchaseId: 'purchase-1',
      quantity: 1,
      responsibleItAdminEmployeeId: 'it-left',
      actor: actor('it-actor'),
    });

    expect(findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(tx);
    expect(notifyInApp).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ recipientEmployeeId: 'sa-1', code: 'SUBSCRIPTION_SEATS_BOUGHT' }),
    );
  });

  it('skips notification when responsible IT admin is the actor recording the purchase', async () => {
    const { tx, notifyInApp, findUsableSuperAdminEmployeeId, service } = build();

    const told = await service.notifySeatsBought(tx, {
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      subscriptionLineId: 'line-1',
      seatPurchaseId: 'purchase-1',
      quantity: 2,
      responsibleItAdminEmployeeId: 'it-resp',
      actor: actor('it-resp'),
    });

    expect(told).toBe(0);
    expect(findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(notifyInApp).not.toHaveBeenCalled();
  });
});
