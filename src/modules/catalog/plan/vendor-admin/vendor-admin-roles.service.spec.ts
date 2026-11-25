import type { WorkspaceDuty } from '../../public/catalog.types';
import type { PlanFactsService } from '../plan-facts.service';
import type { PlanRepo } from '../plan.repo';
import { VendorAdminRolesService } from './vendor-admin-roles.service';

describe('VendorAdminRolesService: one entry for each workspace a person administers (W3-10)', () => {
  const duty = (workspaceId: string, over: Partial<WorkspaceDuty> = {}): WorkspaceDuty => ({
    employeeId: 'emp-nam',
    planId: `plan-${workspaceId}`,
    planName: 'Claude Team Standard',
    applicationName: 'Claude',
    role: 'ADMIN',
    emergencyAccountDeclared: false,
    workspace: {
      id: workspaceId,
      name: 'Anthropic',
      vendorId: 'v-1',
      responsibleItAdminEmployeeId: 'emp-khoa',
      members: [
        { employeeId: 'emp-khoa', role: 'OWNER' },
        { employeeId: 'emp-nam', role: 'ADMIN' },
      ],
    },
    ...over,
  });

  function setup(duties: WorkspaceDuty[], working: string[]) {
    const plans = {
      findWorkspaceDuties: jest.fn().mockResolvedValue(duties),
      findLookups: jest.fn().mockResolvedValue(duties.map((d) => ({ id: d.planId, applicationId: 'app-1' }))),
    } as unknown as PlanRepo;
    const facts = { workingAdminsAmong: jest.fn().mockResolvedValue(new Set(working)) } as unknown as PlanFactsService;

    return new VendorAdminRolesService(plans, facts);
  }

  it('gives one role for the workspace "Anthropic", not one for each plan of the vendor, with the workspace named', async () => {
    const roles = await setup([duty('ws-1')], ['emp-khoa', 'emp-nam']).of('emp-nam');

    expect(roles).toEqual([
      {
        planId: 'plan-ws-1',
        planName: 'Claude Team Standard',
        applicationId: 'app-1',
        applicationName: 'Claude',
        role: 'ADMIN',
        othersWorking: 1,
        workspaceId: 'ws-1',
        workspaceName: 'Anthropic',
        vendorId: 'v-1',
        responsibleItAdminEmployeeId: 'emp-khoa',
      },
    ]);
  });

  it('counts the other administrators who no longer work as none left, and the primary owner as an owner', async () => {
    const roles = await setup([duty('ws-1', { role: 'PRIMARY_OWNER' })], ['emp-nam']).of('emp-nam');

    expect(roles[0]).toMatchObject({ role: 'OWNER', othersWorking: 0 });
  });

  it('has no role for a person who administers nothing, and leaves out a duty that names no workspace', async () => {
    expect(await setup([], []).of('emp-nam')).toEqual([]);
    expect(await setup([duty('ws-1', { workspace: undefined })], ['emp-khoa']).of('emp-nam')).toEqual([]);
  });
});
