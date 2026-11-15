import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccountRecordService } from '../accounts/account-record.service';
import { PendingPolicyAcknowledgements } from '../public/identity-access.extension-points';
import { MeService } from './me.service';

const PROFILE = {
  id: 'employee-1',
  employeeCode: 'E-1',
  fullName: 'An Nguyen',
  department: { code: 'P-ENG', name: 'Engineering' },
  jobTitle: 'Engineer',
};

const principal = (directRoles: string[], roles: string[]): AuthenticatedPrincipal => ({
  subject: 'user-1',
  appUserId: 'user-1',
  sessionId: 'session-1',
  employeeId: 'employee-1',
  directRoles,
  roles,
});

function service(options: { headed?: { departmentId: string } | null } = {}) {
  const headed = jest.fn(() => Promise.resolve(options.headed ?? null));
  const brief = jest.fn(() => Promise.resolve({ id: 'department-1', code: 'P-ENG', name: 'Engineering' }));
  const organization = {
    getOrganization: () => Promise.resolve({ timeZone: 'Asia/Ho_Chi_Minh' }),
    getEmployeeProfile: () => Promise.resolve(PROFILE),
    getHeadedDepartment: headed,
    getDepartmentBrief: brief,
    getUpcomingHeadedUnits: () => Promise.resolve([]),
    getDepartmentBriefs: () => Promise.resolve([]),
  } as unknown as OrganizationReadApi;
  const accounts = { findLoginEmail: () => Promise.resolve('an@acme.vn') } as unknown as AccountRecordService;

  const policies = new PendingPolicyAcknowledgements();

  return { subject: new MeService(accounts, organization, policies), headed, brief, policies };
}

describe('MeService (GET /api/v1/me — D-S19)', () => {
  it('returns the directly granted roles as an array, MANAGER and SPENDING_APPROVER among them', async () => {
    const { subject } = service();

    const me = await subject.get(principal(['EMPLOYEE', 'SPENDING_APPROVER'], ['EMPLOYEE', 'SPENDING_APPROVER']));

    expect(me.roles).toEqual(['EMPLOYEE', 'SPENDING_APPROVER']);
    expect(me).not.toHaveProperty('roles.direct');
    expect(me.managerScope).toBeNull();
  });

  it('gives the headed department as managerScope only to a MANAGER heading it today', async () => {
    const { subject, headed, brief } = service({ headed: { departmentId: 'department-1' } });

    const me = await subject.get(principal(['MANAGER'], ['MANAGER']));

    expect(me.managerScope).toEqual({
      departmentId: 'department-1',
      departmentCode: 'P-ENG',
      departmentName: 'Engineering',
    });
    // The same business day the profile of the employee is read for.
    expect(headed).toHaveBeenCalledWith('employee-1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(brief).toHaveBeenCalledWith('department-1');
  });

  it('has no managerScope for a MANAGER who heads nothing today, and still lists MANAGER in the roles', async () => {
    const { subject, headed } = service();

    // The principal of such a person authorizes no MANAGER (their roles lack it); they hold the grant all the same.
    const me = await subject.get(principal(['MANAGER'], []));

    expect(me.roles).toEqual(['MANAGER']);
    expect(me.managerScope).toBeNull();
    expect(headed).not.toHaveBeenCalled();
  });

  it('has no managerScope for a head who holds no MANAGER grant, and reads no department for them', async () => {
    const { subject, headed } = service({ headed: { departmentId: 'department-1' } });

    const me = await subject.get(principal(['EMPLOYEE'], ['EMPLOYEE']));

    expect(me.managerScope).toBeNull();
    expect(headed).not.toHaveBeenCalled();
  });

  it.each(['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'MANAGER', 'EMPLOYEE', 'SPENDING_APPROVER'])(
    'returns the single role %s without selfServiceOnly',
    async (role) => {
      const { subject } = service();
      const me = await subject.get(principal([role], [role]));
      expect(me.roles).toEqual([role]);
      expect(me).not.toHaveProperty('selfServiceOnly');
    },
  );

  it('lists the policies the caller owes an acknowledgement of, from every source that was added', async () => {
    const { subject, policies } = service();
    policies.add('one', {
      pendingFor: () => Promise.resolve([{ code: 'POL-GEN', title: 'Quy định chung', versionNumber: 2 }]),
    });
    policies.add('two', {
      pendingFor: () => Promise.resolve([{ code: 'POL-MF1', title: 'Cấp phát', versionNumber: 1 }]),
    });

    const me = await subject.get(principal(['MANAGER'], ['MANAGER']));

    expect(me.pendingPolicyAcknowledgements).toEqual([
      { code: 'POL-GEN', title: 'Quy định chung', versionNumber: 2 },
      { code: 'POL-MF1', title: 'Cấp phát', versionNumber: 1 },
    ]);
  });

  it('lists nothing when no module added a source', async () => {
    const { subject } = service();

    expect((await subject.get(principal(['EMPLOYEE'], ['EMPLOYEE']))).pendingPolicyAcknowledgements).toEqual([]);
  });

  it('asks the sources with the roles that were granted, not the roles in force', async () => {
    const { subject, policies } = service();
    const asked = jest.fn(() => Promise.resolve([]));
    policies.add('spy', { pendingFor: asked });

    await subject.get(principal(['MANAGER', 'EMPLOYEE'], ['EMPLOYEE']));

    expect(asked).toHaveBeenCalledWith({
      appUserId: 'user-1',
      employeeId: 'employee-1',
      roles: ['MANAGER', 'EMPLOYEE'],
    });
  });
});
