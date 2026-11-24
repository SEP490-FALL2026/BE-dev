import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { NeedDecisionEffects } from './need-decision-effects.service';

const tx = {} as DbTx;
const decidedAt = new Date('2026-11-24T00:00:00Z');
const actor = {
  appUserId: 'u-head',
  employeeId: 'emp-head',
  roles: ['EMPLOYEE'],
  sessionId: 's-1',
} as unknown as AuthenticatedPrincipal;

describe('NeedDecisionEffects assessment routing (H10, H18)', () => {
  function setup(defaultAssignee: string | null) {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1', 'it-sub']));
    const itAdminsActingFor = jest.fn(
      async (_depts: readonly string[], usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-1', 'it-sub']);
        return defaultAssignee
          ? new Map([
              ['dept-1', { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee, actors: [defaultAssignee] }],
            ])
          : new Map();
      },
    );
    const steps = { add: jest.fn() };
    const audit = { record: jest.fn() };
    const request = {
      id: 'req-1',
      organizationId: 'org-1',
      type: 'GRANT',
      branch: 'NEW_SOFTWARE',
      departmentId: 'dept-1',
      requesterEmployeeId: 'emp-1',
      beneficiaryEmployeeIds: ['emp-1'],
      policy: { slaWorkingDays: 2 },
    } as unknown as AccessRequestRecord;

    const service = new NeedDecisionEffects(
      { findById: jest.fn().mockResolvedValue(request) } as never,
      steps as never,
      { itAdminsActingFor } as never,
      audit as never,
      {} as never,
      {} as never,
      { findUsableItAdminEmployeeIds } as never,
    );

    return { service, steps, audit, itAdminsActingFor, findUsableItAdminEmployeeIds, request };
  }

  it('assigns the assessment step to defaultAssignee (substitute over in-charge) of request.departmentId', async () => {
    const { service, steps, audit, itAdminsActingFor, findUsableItAdminEmployeeIds, request } = setup('it-sub');

    await service.follow(
      tx,
      actor,
      request,
      { approved: true, returned: false, requestState: 'AWAITING_IT_ASSESSMENT' } as never,
      decidedAt,
    );

    expect(itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function), tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1', 'it-sub'], tx);
    expect(steps.add).toHaveBeenCalledWith(tx, {
      requestId: 'req-1',
      assigneeEmployeeId: 'it-sub',
      slaWorkingDays: 2,
      now: decidedAt,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'ACCESS_REQUEST.ASSESSMENT_REQUESTED',
        after: { requestId: 'req-1', itAdminEmployeeId: 'it-sub' },
      }),
    );
  });

  it('leaves the step unassigned (null) when no acting IT Admin exists', async () => {
    const { service, steps, audit, request } = setup(null);

    await service.follow(
      tx,
      actor,
      request,
      { approved: true, returned: false, requestState: 'AWAITING_IT_ASSESSMENT' } as never,
      decidedAt,
    );

    expect(steps.add).toHaveBeenCalledWith(tx, {
      requestId: 'req-1',
      assigneeEmployeeId: null,
      slaWorkingDays: 2,
      now: decidedAt,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        after: { requestId: 'req-1', itAdminEmployeeId: null },
      }),
    );
  });
});
