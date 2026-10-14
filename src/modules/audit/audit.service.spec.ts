import { DbTx } from '../../infrastructure/database/transaction-runner';
import { UnsafeAuditPayloadError } from './audit.errors';
import { AuditService } from './audit.service';
import { AuditEventInput } from './audit.types';

describe('AuditService', () => {
  const insert = jest.fn().mockResolvedValue(undefined);
  const service = new AuditService({ insert });
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
});
