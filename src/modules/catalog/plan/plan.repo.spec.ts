import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PlanRepo } from './plan.repo';

describe('PlanRepo.findWorkspaceDuties', () => {
  it('executes one constant $queryRaw statement and returns PRIMARY_OWNER before ADMIN members', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          workspace_id: 'ws-1',
          workspace_name: 'Figma',
          vendor_id: 'ven-1',
          primary_owner_employee_id: 'emp-1',
          responsible_it_admin_employee_id: 'emp-it',
          emergency_account_declared: true,
          members: [
            { employeeId: 'emp-1', role: 'OWNER' },
            { employeeId: 'emp-2', role: 'ADMIN' },
          ],
          plan_id: 'plan-1',
          plan_name: 'FigJam',
          application_name: 'Figma',
        },
      ]);
    const repo = new PlanRepo({ $queryRaw: queryRaw } as unknown as PrismaService);

    expect(await repo.findWorkspaceDuties([])).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();

    expect(await repo.findWorkspaceDuties(['emp-none'])).toEqual([]);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const duties = await repo.findWorkspaceDuties(['emp-1', 'emp-2']);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(duties.map((d) => [d.employeeId, d.role, d.planId, d.emergencyAccountDeclared])).toEqual([
      ['emp-1', 'PRIMARY_OWNER', 'plan-1', true],
      ['emp-2', 'ADMIN', 'plan-1', true],
    ]);
  });
});
