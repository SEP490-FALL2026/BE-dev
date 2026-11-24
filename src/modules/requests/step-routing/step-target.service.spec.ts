import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { StepTargetService } from './step-target.service';

const tx = {} as DbTx;

describe('StepTargetService assessment target and IT_ASSESSMENT redetermination (H10, H18)', () => {
  function setup(acting?: {
    inCharge: string | null;
    substitute: string | null;
    defaultAssignee: string | null;
    actors: string[];
  }) {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(acting?.actors ?? []));
    const itAdminsActingFor = jest.fn(
      async (_depts: readonly string[], usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-1', 'it-sub']);
        return acting ? new Map([['dept-1', acting]]) : new Map();
      },
    );
    const service = new StepTargetService(
      { itAdminsActingFor } as never,
      { findUsableItAdminEmployeeIds } as never,
      {} as never,
    );

    return { service, itAdminsActingFor, findUsableItAdminEmployeeIds };
  }

  it('assessmentTarget resolves defaultAssignee (substitute ?? inCharge) for the department', async () => {
    const { service, itAdminsActingFor, findUsableItAdminEmployeeIds } = setup({
      inCharge: 'it-1',
      substitute: 'it-sub',
      defaultAssignee: 'it-sub',
      actors: ['it-1', 'it-sub'],
    });

    await expect(service.assessmentTarget(tx, 'dept-1')).resolves.toBe('it-sub');
    expect(itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function), tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1', 'it-sub'], tx);
  });

  it('assessmentTarget returns null when no acting IT Admin exists', async () => {
    const { service } = setup({ inCharge: null, substitute: null, defaultAssignee: null, actors: [] });

    await expect(service.assessmentTarget(tx, 'dept-1')).resolves.toBeNull();
  });

  it('targetOf IT_ASSESSMENT returns defaultAssignee when available and NO_IT_ADMIN_IN_CHARGE when absent', async () => {
    const withSub = setup({
      inCharge: 'it-1',
      substitute: 'it-sub',
      defaultAssignee: 'it-sub',
      actors: ['it-1', 'it-sub'],
    });
    const req = {
      id: 'req-1',
      departmentId: 'dept-1',
      requesterEmployeeId: 'emp-1',
      beneficiaryEmployeeIds: ['emp-1'],
      lines: [],
    } as never;
    const step = { id: 'step-1', kind: 'IT_ASSESSMENT' } as never;
    const facts = { today: '2026-11-24', spendingApproverEmployeeId: null } as never;

    await expect(withSub.service.targetOf(tx, req, step, facts)).resolves.toEqual({
      assigneeEmployeeId: 'it-sub',
      routingRow: null,
    });

    const withoutAdmin = setup({ inCharge: null, substitute: null, defaultAssignee: null, actors: [] });
    await expect(withoutAdmin.service.targetOf(tx, req, step, facts)).resolves.toEqual({
      assigneeEmployeeId: null,
      reason: 'NO_IT_ADMIN_IN_CHARGE',
    });
  });
});
