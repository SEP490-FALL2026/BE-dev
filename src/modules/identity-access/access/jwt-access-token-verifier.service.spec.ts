import { TokenVerificationUnavailableError } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SessionRecordService } from '../auth/session-record.service';
import { TokenService } from '../auth/token.service';
import { JwtAccessTokenVerifier } from './jwt-access-token-verifier.service';

const SUB = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const SID = 'a8b6c4d2-1f3e-4a5b-9c7d-0e2f4a6b8c10';

function verifierFailingWith(error: Error): JwtAccessTokenVerifier {
  const tokens = { verifyAccessToken: () => Promise.resolve({ sub: SUB, sid: SID }) } as unknown as TokenService;
  const sessions = { findPrincipalContext: () => Promise.reject(error) } as unknown as SessionRecordService;
  const organization = {} as OrganizationReadApi;

  return new JwtAccessTokenVerifier(tokens, sessions, organization);
}

describe('JwtAccessTokenVerifier — database failures', () => {
  it.each([
    new Error('Query read timeout'),
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
  ])('answers "unavailable" (503) when the database cannot be reached: %s', async (error) => {
    await expect(verifierFailingWith(error).verify('token')).rejects.toBeInstanceOf(TokenVerificationUnavailableError);
  });

  // An unexpected failure is a defect, not an outage: it must keep its own identity so it is
  // reported as an internal error instead of being disguised as a retryable 503.
  it('does not disguise an unexpected error as an outage', async () => {
    const defect = new TypeError('Cannot read properties of undefined');
    const outcome = await verifierFailingWith(defect)
      .verify('token')
      .catch((error: unknown) => error);

    expect(outcome).toBe(defect);
    expect(outcome).not.toBeInstanceOf(TokenVerificationUnavailableError);
  });
});

describe('JwtAccessTokenVerifier — the roles of the caller (US-01-02, QĐ-93a)', () => {
  const NOW = Date.now();
  const context = (directRoles: string[]) => ({
    appUserId: SUB,
    sessionId: SID,
    employeeId: 'employee-1',
    organizationId: 'organization-1',
    status: 'ACTIVE',
    activationState: 'ACTIVATED',
    sessionRevokedAt: null,
    idleExpiresAt: new Date(NOW + 60_000),
    absoluteExpiresAt: new Date(NOW + 120_000),
    directRoles,
  });
  const verifier = (directRoles: string[], headed: { departmentId: string } | null) => {
    const headedDepartment = jest.fn(() => Promise.resolve(headed));
    const tokens = { verifyAccessToken: () => Promise.resolve({ sub: SUB, sid: SID }) } as unknown as TokenService;
    const sessions = {
      findPrincipalContext: () => Promise.resolve(context(directRoles)),
    } as unknown as SessionRecordService;
    const organization = {
      getEmployee: () => Promise.resolve({ status: 'ACTIVE', workState: 'WORKING' }),
      getHeadedDepartment: headedDepartment,
    } as unknown as OrganizationReadApi;

    return { headedDepartment, verifier: new JwtAccessTokenVerifier(tokens, sessions, organization) };
  };

  it('keeps MANAGER for a head today, and lists the granted roles as they are', async () => {
    const { verifier: subject } = verifier(['MANAGER', 'EMPLOYEE'], { departmentId: 'department-1' });

    const principal = await subject.verify('token');

    expect(principal.directRoles).toEqual(['EMPLOYEE', 'MANAGER']);
    expect(principal.roles).toEqual(['EMPLOYEE', 'MANAGER']);
    expect(principal).not.toHaveProperty('derivedRoles');
  });

  it('drops MANAGER for a person who holds it and heads nothing today, but keeps it in the granted roles', async () => {
    const { verifier: subject } = verifier(['MANAGER'], null);

    const principal = await subject.verify('token');

    expect(principal.directRoles).toEqual(['MANAGER']);
    expect(principal.roles).toEqual([]);
  });

  it('never derives a role: a head without the grant is no MANAGER, and the spending approver is the grant only', async () => {
    const head = await verifier(['EMPLOYEE'], { departmentId: 'department-1' }).verifier.verify('token');
    const approver = await verifier(['SPENDING_APPROVER'], null).verifier.verify('token');

    expect(head.roles).toEqual(['EMPLOYEE']);
    expect(approver.roles).toEqual(['SPENDING_APPROVER']);
    expect(approver.directRoles).toEqual(['SPENDING_APPROVER']);
  });

  it('reads the department of the caller only when MANAGER is granted', async () => {
    const without = verifier(['IT_ADMIN'], { departmentId: 'department-1' });
    const withManager = verifier(['MANAGER'], { departmentId: 'department-1' });

    await without.verifier.verify('token');
    await withManager.verifier.verify('token');

    expect(without.headedDepartment).not.toHaveBeenCalled();
    expect(withManager.headedDepartment).toHaveBeenCalledTimes(1);
  });
});
