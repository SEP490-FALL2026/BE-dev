import { Prisma } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { RoleGrantService } from '../accounts/role-grant.service';
import { RecoveryRefusedError } from '../public/recovery.errors';
import type { RecoveryRepo, TicketRecord } from './recovery.repo';
import { RoleHandover } from './role-handover.service';

function setup(holderId: string | null = 'old') {
  const writes: string[] = [];
  const grants = {
    effectiveRoles: jest.fn((id: string) => Promise.resolve(id === 'old' ? ['SUPER_ADMIN'] : ['EMPLOYEE'])),
    revokeRole: jest.fn((_tx: DbTx, input: { appUserId: string; role: string }) => {
      writes.push(`revoke ${input.appUserId} ${input.role}`);
      return Promise.resolve(true);
    }),
    grantRole: jest.fn((_tx: DbTx, input: { appUserId: string; role: string }) => {
      writes.push(`grant ${input.appUserId} ${input.role}`);
      return Promise.resolve({ id: 'grant' });
    }),
  };
  const record = jest.fn().mockResolvedValue(undefined);
  const setStatus = jest.fn().mockResolvedValue(undefined);
  const service = new RoleHandover(
    grants as unknown as RoleGrantService,
    { setStatus } as unknown as RecoveryRepo,
    { record } as unknown as AuditApi,
  );
  const input = {
    context: {
      ticketRef: 'R-2026-014',
      approverRef: 'approver',
      operatorRef: 'ops',
      environment: 'LOCAL_TEST' as const,
    },
    organizationId: 'org',
    ticket: { id: 'ticket' } as TicketRecord,
    holderId,
    successorAccountId: 'new',
    now: new Date('2026-11-04T00:00:00Z'),
  };

  return { service, grants, writes, record, setStatus, input, tx: {} as DbTx };
}

describe('one-role recovery handover', () => {
  it('revokes both previous grants before granting SUPER_ADMIN, then gives the former holder EMPLOYEE', async () => {
    const h = setup();
    await h.service.move(h.tx, h.input);
    expect(h.writes).toEqual([
      'revoke old SUPER_ADMIN',
      'revoke new EMPLOYEE',
      'grant new SUPER_ADMIN',
      'grant old EMPLOYEE',
    ]);
    expect(h.record.mock.calls.map((call: unknown[]) => call[1])).toEqual([
      expect.objectContaining({
        action: 'SUPER_ADMIN.TRANSFERRED_OUT',
        before: { roles: ['SUPER_ADMIN'] },
        after: expect.objectContaining({ roles: ['EMPLOYEE'] }) as unknown,
      }),
      expect.objectContaining({
        action: 'SUPER_ADMIN.TRANSFERRED_IN',
        before: { roles: ['EMPLOYEE'] },
        after: expect.objectContaining({ roles: ['SUPER_ADMIN'] }) as unknown,
      }),
    ]);
  });

  it('handles an absent holder without creating a replacement account or grant', async () => {
    const h = setup(null);
    await h.service.move(h.tx, h.input);
    expect(h.writes).toEqual(['revoke new EMPLOYEE', 'grant new SUPER_ADMIN']);
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('maps an unnamed check violation to HEADS_DEPARTMENT and never completes or audits the failed transfer', async () => {
    const h = setup();
    h.grants.grantRole.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('check violation', {
        code: 'P2010',
        clientVersion: '7',
        meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
      }),
    );
    await expect(h.service.move(h.tx, h.input)).rejects.toEqual(new RecoveryRefusedError('HEADS_DEPARTMENT'));
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });
});
