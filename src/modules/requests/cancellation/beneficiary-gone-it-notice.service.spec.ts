import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { UsableItAdmins } from '../../organization/public/organization.types';
import { BeneficiaryGoneItNotice } from './beneficiary-gone-it-notice.service';

interface NoticeCall {
  organizationId: string;
  recipientEmployeeId: string;
  code: string;
  subject: { type: string; id: string };
  params: Record<string, unknown>;
  eventKey: string;
}

function harness(options: {
  acting?: { actors: string[]; substitute: string | null } | undefined;
  superAdminId?: string | null;
}) {
  const tx = { tag: 'tx' } as unknown as DbTx;
  const notifyInApp = jest.fn<Promise<boolean>, [DbTx, NoticeCall]>().mockResolvedValue(true);
  const actingMap = options.acting ? new Map([['dept-1', options.acting]]) : new Map();
  const organizationReads = {
    itAdminsActingFor: jest.fn().mockImplementation(async (_depts: string[], usableAmong: UsableItAdmins) => {
      await usableAmong(['emp-incharge']);
      return actingMap;
    }),
  };
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['emp-incharge'])),
    findUsableSuperAdminEmployeeId: jest
      .fn()
      .mockResolvedValue(options.superAdminId === undefined ? 'emp-sa' : options.superAdminId),
  };

  const service = new BeneficiaryGoneItNotice(organizationReads as never, identity as never, { notifyInApp } as never);

  return { tx, service, notifyInApp, organizationReads, identity };
}

describe('BeneficiaryGoneItNotice', () => {
  const request = { id: 'req-1', organizationId: 'org-1', departmentId: 'dept-1' };

  it('notifies usable in-charge IT Admin', async () => {
    const { tx, service, notifyInApp, identity } = harness({
      acting: { actors: ['emp-incharge'], substitute: null },
    });

    await service.tell(tx, request, 'emp-gone', { kind: 'ALL_OPEN' });

    expect(identity.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifyInApp).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-incharge',
      code: 'REQUEST_BENEFICIARY_GONE_IT_CHECK',
      subject: { type: 'ACCESS_REQUEST', id: 'req-1' },
      params: { requestId: 'req-1', beneficiaryEmployeeId: 'emp-gone', reasonKind: 'DEPARTURE' },
      eventKey: 'BENEFICIARY_GONE_IT_CHECK:req-1:emp-gone',
    });
  });

  it('notifies active substitute along with usable in-charge, or substitute alone when in-charge is locked', async () => {
    const both = harness({ acting: { actors: ['emp-incharge', 'emp-sub'], substitute: 'emp-sub' } });
    await both.service.tell(both.tx, request, 'emp-gone', { kind: 'PAID_OLD_DEPARTMENT', oldDepartmentId: 'dept-1' });
    expect(both.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-incharge', 'emp-sub']);
    expect(both.notifyInApp.mock.calls[0][1].params.reasonKind).toBe('TRANSFER');

    const subOnly = harness({ acting: { actors: ['emp-sub'], substitute: 'emp-sub' } });
    await subOnly.service.tell(subOnly.tx, request, 'emp-gone', { kind: 'ALL_OPEN' });
    expect(subOnly.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sub']);
  });

  it('falls back to Super Admin when in-charge is locked and no substitute exists', async () => {
    const { tx, service, notifyInApp, identity } = harness({
      acting: { actors: [], substitute: null },
      superAdminId: 'emp-sa',
    });

    await service.tell(tx, request, 'emp-gone', { kind: 'ALL_OPEN' });

    expect(identity.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(tx);
    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);
  });

  it('sends no notification when no acting IT Admin and no usable Super Admin exist', async () => {
    const { tx, service, notifyInApp } = harness({
      acting: { actors: [], substitute: null },
      superAdminId: null,
    });

    await service.tell(tx, request, 'emp-gone', { kind: 'ALL_OPEN' });

    expect(notifyInApp).not.toHaveBeenCalled();
  });
});
