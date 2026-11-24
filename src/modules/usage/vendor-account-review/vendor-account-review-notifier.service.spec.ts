import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { VendorAccountReviewNotifier } from './vendor-account-review-notifier.service';

interface NoticeCall {
  organizationId: string;
  recipientEmployeeId: string;
  code: string;
  subject: null;
  params: Record<string, unknown>;
  eventKey: string;
}

function harness(options: { responsible?: string | null; usableIds?: string[]; superAdminId?: string | null }) {
  const tx = { tag: 'tx' } as unknown as DbTx;
  const notifyInApp = jest.fn<Promise<boolean>, [DbTx, NoticeCall]>().mockResolvedValue(true);
  const catalog = {
    getApplicationResponsibleItAdminId: jest.fn().mockResolvedValue(options.responsible ?? null),
  };
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(options.usableIds ?? [])),
    findUsableSuperAdminEmployeeId: jest
      .fn()
      .mockResolvedValue(options.superAdminId === undefined ? 'emp-sa' : options.superAdminId),
  };

  const notifier = new VendorAccountReviewNotifier(
    { notifyInApp } as never,
    {} as never,
    identity as never,
    catalog as never,
    {} as never,
  );

  return { tx, notifier, notifyInApp, catalog, identity };
}

describe('VendorAccountReviewNotifier.opened', () => {
  it('notifies only the usable application responsible IT Admin', async () => {
    const { tx, notifier, notifyInApp, identity } = harness({
      responsible: 'emp-it1',
      usableIds: ['emp-it1'],
    });

    await notifier.opened(tx, {
      organizationId: 'org-1',
      applicationId: 'app-1',
      vendorId: 'ven-1',
      source: 'USAGE_IMPORT',
      newCount: 3,
      occasion: 'imp-1',
    });

    expect(identity.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['emp-it1'], tx);
    expect(identity.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifyInApp).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-it1',
      code: 'VENDOR_ACCOUNT_DISCREPANCY_OPENED',
      subject: null,
      params: { applicationId: 'app-1', vendorId: 'ven-1', source: 'USAGE_IMPORT', newCount: 3 },
      eventKey: 'VENDOR_ACCOUNT_DISCREPANCY_OPENED:USAGE_IMPORT:imp-1',
    });
  });

  it('notifies only Super Admin when responsible IT Admin is locked or unusable', async () => {
    const { tx, notifier, notifyInApp, identity } = harness({
      responsible: 'emp-it1',
      usableIds: [],
      superAdminId: 'emp-sa',
    });

    await notifier.opened(tx, {
      organizationId: 'org-1',
      applicationId: 'app-1',
      vendorId: 'ven-1',
      source: 'USAGE_IMPORT',
      newCount: 2,
      occasion: 'imp-2',
    });

    expect(identity.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(tx);
    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);
  });

  it('notifies only Super Admin when applicationId is null or no responsible IT Admin is assigned', async () => {
    const noApp = harness({ superAdminId: 'emp-sa' });
    await noApp.notifier.opened(noApp.tx, {
      organizationId: 'org-1',
      applicationId: null,
      vendorId: null,
      source: 'COLLECTOR_UNLISTED',
      newCount: 1,
      occasion: '2026-10-20',
    });
    expect(noApp.catalog.getApplicationResponsibleItAdminId).not.toHaveBeenCalled();
    expect(noApp.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);

    const noOwner = harness({ responsible: null, superAdminId: 'emp-sa' });
    await noOwner.notifier.opened(noOwner.tx, {
      organizationId: 'org-1',
      applicationId: 'app-1',
      vendorId: 'ven-1',
      source: 'INVOICE_DIFFERENCE',
      newCount: 1,
      occasion: 'case-1',
    });
    expect(noOwner.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);
  });

  it('notifies nobody when newCount <= 0 or when Super Admin is unavailable', async () => {
    const zero = harness({ responsible: 'emp-it1', usableIds: ['emp-it1'] });
    await zero.notifier.opened(zero.tx, {
      organizationId: 'org-1',
      applicationId: 'app-1',
      vendorId: 'ven-1',
      source: 'USAGE_IMPORT',
      newCount: 0,
      occasion: 'imp-0',
    });
    expect(zero.notifyInApp).not.toHaveBeenCalled();

    const noSa = harness({ responsible: null, superAdminId: null });
    await noSa.notifier.opened(noSa.tx, {
      organizationId: 'org-1',
      applicationId: null,
      vendorId: null,
      source: 'COLLECTOR_UNLISTED',
      newCount: 1,
      occasion: '2026-10-21',
    });
    expect(noSa.notifyInApp).not.toHaveBeenCalled();
  });
});
