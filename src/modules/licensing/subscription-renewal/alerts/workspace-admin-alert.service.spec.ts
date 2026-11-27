import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { CatalogResponsibilityApi } from '../../../catalog/public/catalog-responsibility.api';
import type { WorkspaceNotWorkingAdmins } from '../../../catalog/public/catalog-responsibility.types';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { RenewalNotifier } from '../subscription-renewal-notifier.service';
import { WorkspaceAdminAlertService } from './workspace-admin-alert.service';

describe('WorkspaceAdminAlertService (W3-12)', () => {
  const tx = { tag: 'tx' } as unknown as DbTx;

  function setup(options: {
    workspaces: WorkspaceNotWorkingAdmins[];
    usableItAdmins?: string[];
    superAdmin?: string | null;
  }) {
    const seenKeys = new Set<string>();
    const sent: Array<{
      recipients: readonly string[];
      code: string;
      subject: { type: string; id: string };
      params: Record<string, unknown>;
      eventKey: string;
    }> = [];
    const notifier = {
      tell: jest.fn((_tx: DbTx, input: (typeof sent)[number]) => {
        const told: string[] = [];
        for (const recipient of input.recipients) {
          const dedupe = `${recipient}:${input.eventKey}`;
          if (seenKeys.has(dedupe)) continue;
          seenKeys.add(dedupe);
          sent.push(input);
          told.push(recipient);
        }

        return Promise.resolve(told);
      }),
    } as unknown as RenewalNotifier;
    const catalog = {
      workspacesWithNotWorkingAdmins: jest.fn().mockResolvedValue(options.workspaces),
    } as unknown as CatalogResponsibilityApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn((ids: readonly string[]) =>
        Promise.resolve(new Set(ids.filter((id) => (options.usableItAdmins ?? []).includes(id)))),
      ),
      findUsableSuperAdminEmployeeId: jest
        .fn()
        .mockResolvedValue(options.superAdmin === undefined ? 'sa-1' : options.superAdmin),
    } as unknown as IdentityAccessApi;
    const runner = { run: <T>(fn: (t: DbTx) => Promise<T>) => fn(tx) };

    return {
      service: new WorkspaceAdminAlertService(catalog, identity, notifier, runner as never),
      sent,
    };
  }

  it('tells the usable responsible IT Admin once per (workspace, admin) across repeated sweep runs', async () => {
    const { service, sent } = setup({
      workspaces: [
        {
          workspaceId: 'ws-1',
          organizationId: 'org-1',
          responsibleItAdminEmployeeId: 'emp-khoa',
          workingAdminCount: 1,
          notWorkingAdminEmployeeIds: ['emp-nam'],
        },
        {
          workspaceId: 'ws-other-org',
          organizationId: 'org-other',
          responsibleItAdminEmployeeId: 'emp-khoa',
          workingAdminCount: 0,
          notWorkingAdminEmployeeIds: ['emp-x'],
        },
      ],
      usableItAdmins: ['emp-khoa'],
    });

    expect(await service.sweep('org-1')).toBe(1);
    expect(await service.sweep('org-1')).toBe(0);
    expect(await service.sweep('org-1')).toBe(0);
    expect(sent).toEqual([
      {
        organizationId: 'org-1',
        recipients: ['emp-khoa'],
        code: 'WORKSPACE_ADMIN_NOT_WORKING',
        subject: { type: 'WORKSPACE', id: 'ws-1' },
        params: { workspaceId: 'ws-1', employeeId: 'emp-nam', workingAdminCount: 1 },
        eventKey: 'WORKSPACE_ADMIN_NOT_WORKING:ws-1:emp-nam',
      },
    ]);
  });

  it('falls back to the usable Super Admin when responsible is the affected admin or no longer usable as IT_ADMIN', async () => {
    const { service, sent } = setup({
      workspaces: [
        {
          workspaceId: 'ws-role-changed',
          organizationId: 'org-1',
          responsibleItAdminEmployeeId: 'emp-khoa',
          workingAdminCount: 1,
          notWorkingAdminEmployeeIds: ['emp-khoa'],
        },
        {
          workspaceId: 'ws-unusable-resp',
          organizationId: 'org-1',
          responsibleItAdminEmployeeId: 'emp-former-it',
          workingAdminCount: 0,
          notWorkingAdminEmployeeIds: ['emp-nam'],
        },
      ],
      usableItAdmins: [],
      superAdmin: 'emp-sa',
    });

    expect(await service.sweep('org-1')).toBe(2);
    expect(sent.map((item) => ({ recipient: item.recipients[0], eventKey: item.eventKey }))).toEqual([
      { recipient: 'emp-sa', eventKey: 'WORKSPACE_ADMIN_NOT_WORKING:ws-role-changed:emp-khoa' },
      { recipient: 'emp-sa', eventKey: 'WORKSPACE_ADMIN_NOT_WORKING:ws-unusable-resp:emp-nam' },
    ]);
  });
});
