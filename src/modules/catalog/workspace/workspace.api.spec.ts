import type { WorkspaceRepo } from './workspace.repo';
import type { WorkspaceViewService } from './workspace-view.service';
import type { WorkspaceRecord } from './workspace.types';
import { WorkspaceApi } from '../public/workspace.api';

describe('WorkspaceApi', () => {
  const khoa = { employeeId: 'khoa', role: 'OWNER' as const };
  const nam = { employeeId: 'nam', role: 'ADMIN' as const };
  const workspace = (id: string, overrides: Partial<WorkspaceRecord> = {}) =>
    ({ id, admins: [khoa, nam], responsibleItAdminEmployeeId: 'khoa', ...overrides }) as unknown as WorkspaceRecord;

  function setup(records: WorkspaceRecord[]) {
    const repo = {
      findMany: jest.fn().mockResolvedValue(records),
      find: jest.fn((id: string) => Promise.resolve(records.find((record) => record.id === id) ?? null)),
      findOfVendor: jest.fn().mockResolvedValue(records),
    } as unknown as WorkspaceRepo;
    const views = { workingAdminCount: jest.fn().mockResolvedValue(1) } as unknown as WorkspaceViewService;

    return new WorkspaceApi(repo, views);
  }

  it('gives the administrators of each workspace by id, and leaves out one that does not exist', async () => {
    const api = setup([workspace('ws-1')]);

    await expect(api.adminsOf(['ws-1', 'ws-9'])).resolves.toEqual(new Map([['ws-1', [khoa, nam]]]));
  });

  it('counts the administrators who work, zero for a workspace that does not exist', async () => {
    const api = setup([workspace('ws-1')]);

    await expect(api.workingAdminCount('ws-1')).resolves.toBe(1);
    await expect(api.workingAdminCount('ws-9')).resolves.toBe(0);
  });

  it('names who answers for a workspace, none for a workspace nobody answers for or that does not exist', async () => {
    const api = setup([workspace('ws-1'), workspace('ws-2', { responsibleItAdminEmployeeId: null })]);

    await expect(api.responsibleOf('ws-1')).resolves.toBe('khoa');
    await expect(api.responsibleOf('ws-2')).resolves.toBeNull();
    await expect(api.responsibleOf('ws-9')).resolves.toBeNull();
  });

  it.each([
    { records: [], expected: { kind: 'NONE' } },
    { records: [workspace('ws-1')], expected: { kind: 'ONE', workspaceId: 'ws-1' } },
    { records: [workspace('ws-1'), workspace('ws-2')], expected: { kind: 'MANY', workspaceIds: ['ws-1', 'ws-2'] } },
  ])('offers a vendor with $records.length workspaces as $expected', async ({ records, expected }) => {
    await expect(setup(records).defaultWorkspaceOfVendor('v-1')).resolves.toEqual(expected);
  });
});
