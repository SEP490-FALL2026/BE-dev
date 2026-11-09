import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { UnsafeAuditPayloadError } from '../audit.errors';
import { AuditApi } from './audit.api';
import { AuditEventInput } from './audit.types';

describe('AuditApi', () => {
  const insert = jest.fn().mockResolvedValue(undefined);
  const countByAction = jest.fn().mockResolvedValue(new Map([['INSTALLATION.EMPLOYEE_CREATED', 2]]));
  const readSince = jest.fn().mockResolvedValue([]);
  const firstAfterField = jest.fn().mockResolvedValue('SHARED');
  const pageOfResources = jest.fn().mockResolvedValue({ rows: [], total: 0 });
  const service = new AuditApi({ insert, countByAction, readSince, firstAfterField, pageOfResources });
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

  it('passes the requested field and transaction through without reading other audit payloads', async () => {
    expect(await service.firstAfterField(tx, 'INSTALLATION.ORGANIZATION_CREATED', 'environment')).toBe('SHARED');
    expect(firstAfterField).toHaveBeenCalledWith(tx, 'INSTALLATION.ORGANIZATION_CREATED', 'environment');
  });

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

  it('reads the next events of the named actions for a consumer of the system, in the caller transaction', async () => {
    const cursor = { occurredAt: new Date('2026-10-24T00:00:00.000Z'), id: '22222222-2222-4222-8222-222222222222' };
    const options = { upTo: new Date('2026-10-24T01:00:00.000Z'), actions: ['ACCESS_REQUEST.WITHDRAWN'], limit: 200 };
    const slice = [{ id: 'e1', action: 'ACCESS_REQUEST.WITHDRAWN' }];
    readSince.mockResolvedValueOnce(slice);

    await expect(service.readSince(tx, cursor, options)).resolves.toBe(slice);
    expect(readSince).toHaveBeenCalledWith(tx, cursor, options);
  });

  it('reads the events of the resources of its owner in the caller transaction, as the repository answers them', async () => {
    const resources = [{ type: 'ACCESS_REQUEST', id: 'r-1' }];
    const query = { actions: ['ACCESS_REQUEST.SUBMITTED'], onlySubject: null, skip: 0, take: 20 };

    await expect(service.pageOfResources(tx, resources, query)).resolves.toEqual({ rows: [], total: 0 });
    expect(pageOfResources).toHaveBeenCalledWith(tx, resources, query);
  });
});
