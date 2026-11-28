import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DepartmentUseContributions } from '../../organization/public/organization.extension-points';
import type { SaasIssueRepo } from './saas-issue.repo';
import { SaasIssueOpenWorkReader } from './department-open-work.listener';

describe('SaasIssueOpenWorkReader', () => {
  const openOfDepartment = jest.fn();
  const repo = { openOfDepartment } as unknown as SaasIssueRepo;
  const getMemberIdsOfDepartments = jest.fn();
  const organizationReads = { getMemberIdsOfDepartments } as unknown as OrganizationReadApi;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers with DepartmentUseContributions in group OPEN_WORK on module init', () => {
    const contributions = new DepartmentUseContributions();
    const reader = new SaasIssueOpenWorkReader(repo, organizationReads, contributions);

    reader.onModuleInit();

    expect(reader.group).toBe('OPEN_WORK');
    expect(SaasIssueOpenWorkReader.binds).toEqual([DepartmentUseContributions]);
    expect(contributions.all()).toContain(reader);
  });

  it('reads department members via OrganizationReadApi and maps unclosed SaaS issues into UseGroup', async () => {
    const tx = { marker: 'tx' } as unknown as DbTx;
    getMemberIdsOfDepartments.mockResolvedValue(['emp-1']);
    openOfDepartment.mockResolvedValue({
      total: 2,
      items: [{ id: 'iss-1', code: 'ISS-2026-0001' }],
    });
    const reader = new SaasIssueOpenWorkReader(repo, organizationReads, new DepartmentUseContributions());

    const result = await reader.read('dep-1', '2026-11-24', 1, tx);

    expect(getMemberIdsOfDepartments).toHaveBeenCalledWith(['dep-1'], '2026-11-24', tx);
    expect(openOfDepartment).toHaveBeenCalledWith('dep-1', ['emp-1'], 1, tx);
    expect(result).toEqual({
      total: 2,
      items: [{ kind: 'SAAS_ISSUE', id: 'iss-1', label: 'ISS-2026-0001' }],
    });
  });
});
