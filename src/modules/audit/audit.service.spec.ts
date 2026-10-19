import { DbTx } from '../../infrastructure/database/transaction-runner';
import { UnsafeAuditPayloadError } from './audit.errors';
import { AuditService } from './audit.service';
import { AuditEventInput } from './audit.types';

describe('AuditService', () => {
  const insert = jest.fn().mockResolvedValue(undefined);
  const countByAction = jest.fn().mockResolvedValue(new Map([['INSTALLATION.EMPLOYEE_CREATED', 2]]));
  const service = new AuditService({ insert, countByAction });
  const tx = {} as DbTx;
  const base: AuditEventInput = {
    organizationId: '11111111-1111-4111-8111-111111111111',
    actorKind: 'SYSTEM',
    action: 'SESSION.REVOKED',
    resourceType: 'AuthSession',
    resourceId: 'abc',
    correlationId: 'corr-1',
  };

  beforeEach(() => insert.mockClear());

  it('passes the caller transaction through to the repository', async () => {
    await service.record(tx, { ...base, after: { status: 'REVOKED' } });
    expect(insert).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'SESSION.REVOKED' }));
  });

  it.each(['password', 'passwordHash', 'refreshToken', 'inviteToken', 'sessionCookie', 'clientSecret'])(
    'rejects a snapshot key named %s',
    async (key) => {
      await expect(service.record(tx, { ...base, after: { nested: { [key]: 'x' } } })).rejects.toBeInstanceOf(
        UnsafeAuditPayloadError,
      );
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it('allows ordinary allow-listed fields', async () => {
    await expect(
      service.record(tx, { ...base, before: { status: 'ACTIVE' }, after: { status: 'LOCKED', roles: ['IT_ADMIN'] } }),
    ).resolves.toBeUndefined();
  });

  it('counts the events of each named action in the caller transaction, zero for an action never recorded', async () => {
    const counts = await service.countByAction(tx, [
      'INSTALLATION.EMPLOYEE_CREATED',
      'INSTALLATION.DEPARTMENT_CREATED',
    ]);

    expect(countByAction).toHaveBeenCalledWith(tx, [
      'INSTALLATION.EMPLOYEE_CREATED',
      'INSTALLATION.DEPARTMENT_CREATED',
    ]);
    expect(counts).toEqual(
      new Map([
        ['INSTALLATION.EMPLOYEE_CREATED', 2],
        ['INSTALLATION.DEPARTMENT_CREATED', 0],
      ]),
    );
  });
});
