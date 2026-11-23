import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { LicensingApi } from '../../licensing/public/licensing.api';
import type { OrganizationApi } from '../../organization/public/organization.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import type { TransferClosureService } from './transfer-closure.service';
import type { TransferGraceRepo } from './transfer-grace.repo';
import type { HeldTransfer } from './transfer-grace.types';
import { TransferRevocationRefusedError } from './transfer-revocation.errors';
import { TransferRevocationService } from './transfer-revocation.service';

describe('TransferRevocationService', () => {
  const actor: AuthenticatedPrincipal = {
    appUserId: 'user-it-1',
    employeeId: 'emp-it-1',
    roles: ['IT_ADMIN'],
    sessionId: 'sess-1',
  } as unknown as AuthenticatedPrincipal;

  const heldTransfer = (overrides: Partial<HeldTransfer> = {}): HeldTransfer => ({
    id: 'tr-1',
    organizationId: 'org-1',
    employeeId: 'emp-1',
    fromDepartmentId: 'dept-1',
    toDepartmentId: 'dept-2',
    effectiveOn: '2026-11-16',
    status: 'EFFECTIVE',
    closed: false,
    graceEndsOn: '2026-11-20',
    graceReminderOn: '2026-11-18',
    reminded: false,
    snapshotBefore: {
      takenOn: '2026-11-16',
      rights: [
        {
          assignmentId: 'asg-1',
          applicationId: 'app-1',
          applicationName: 'App',
          planId: 'p-1',
          planName: 'Plan',
          provisioningType: 'K2',
          effectiveFrom: '2026-09-01',
          validUntil: null,
        },
      ],
      commitmentsReleased: [],
      requestsCancelled: 0,
      requestsToCheck: 0,
    },
    ...overrides,
  });

  function makeSut(options?: {
    foundEmployeeId?: string | null;
    locked?: HeldTransfer | null;
    reopenAccess?: { inReadScope: boolean; isActing: boolean; bySubstitute: boolean };
    openRevocationResult?: {
      taskId: string;
      created: boolean;
      reasonAdded: boolean;
      status: 'QUEUED' | 'CLOSED_FAILED';
    };
  }) {
    const tx = {} as DbTx;
    const pageGraceOver = jest.fn().mockResolvedValue([]);
    const openRevocation = jest
      .fn()
      .mockResolvedValue(
        options?.openRevocationResult ?? { taskId: 'task-1', created: true, reasonAdded: false, status: 'QUEUED' },
      );
    const auditRecord = jest.fn().mockResolvedValue(undefined);

    const runner = {
      run: jest.fn(async (fn: (t: DbTx) => Promise<unknown>) => fn(tx)),
    } as unknown as TransactionRunner;
    const graces = {
      findEmployeeId: jest
        .fn()
        .mockResolvedValue(options?.foundEmployeeId === undefined ? 'emp-1' : options.foundEmployeeId),
      lock: jest.fn().mockResolvedValue(options?.locked === undefined ? heldTransfer() : options.locked),
      pageGraceOver,
      keepSnapshot: jest.fn().mockResolvedValue(true),
    } as unknown as TransferGraceRepo;
    const organization = {
      lockEmployeeForUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationApi;
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2026-11-21'),
    } as unknown as OrganizationReadApi;
    const licensing = {
      listPersonalSeatsOf: jest.fn().mockResolvedValue([
        {
          assignmentId: 'asg-1',
          subscriptionId: 'sub-1',
          effectiveFrom: '2026-09-01',
          validUntil: null,
          provisioningType: 'K2',
        },
      ]),
      openRevocation,
    } as unknown as LicensingApi;
    const audit = { record: auditRecord } as unknown as AuditApi;
    const resolveTransferReopenAccess = jest
      .fn()
      .mockResolvedValue(options?.reopenAccess ?? { inReadScope: true, isActing: true, bySubstitute: false });
    const notifier = {
      transferRightsRevoking: jest.fn().mockResolvedValue(undefined),
      resolveTransferReopenAccess,
    } as unknown as PersonnelNotifier;
    const closing = { closeIfDue: jest.fn().mockResolvedValue(false) } as unknown as TransferClosureService;

    const service = new TransferRevocationService(
      runner,
      graces,
      organization,
      organizationReads,
      licensing,
      audit,
      notifier,
      closing,
    );

    return { service, pageGraceOver, openRevocation, auditRecord };
  }

  describe('sweep', () => {
    it('passes noReopenAfterFailure: true when opening revocations automatically', async () => {
      const { service, pageGraceOver, openRevocation } = makeSut();
      pageGraceOver.mockResolvedValueOnce([{ id: 'tr-1', employeeId: 'emp-1' }]);

      await service.sweep(new Date('2026-11-21T10:00:00Z'));

      expect(openRevocation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'SYSTEM' }),
        expect.objectContaining({ noReopenAfterFailure: true }),
      );
    });
  });

  describe('reopen', () => {
    it('throws NOT_FOUND when the transfer does not exist before locking', async () => {
      const { service } = makeSut({ foundEmployeeId: null });

      await expect(service.reopen(actor, 'missing-id')).rejects.toMatchObject({
        constructor: TransferRevocationRefusedError,
        code: 'NOT_FOUND',
      });
    });

    it('throws NOT_FOUND when lock returns null', async () => {
      const { service } = makeSut({ locked: null });

      await expect(service.reopen(actor, 'tr-1')).rejects.toMatchObject({
        constructor: TransferRevocationRefusedError,
        code: 'NOT_FOUND',
      });
    });

    it('throws NOT_FOUND when actor is outside read scope', async () => {
      const { service, openRevocation } = makeSut({
        reopenAccess: { inReadScope: false, isActing: false, bySubstitute: false },
      });

      await expect(service.reopen(actor, 'tr-1')).rejects.toMatchObject({
        constructor: TransferRevocationRefusedError,
        code: 'NOT_FOUND',
      });
      expect(openRevocation).not.toHaveBeenCalled();
    });

    it('throws NOT_IN_CHARGE when actor is in read scope but not acting for destination department', async () => {
      const { service, openRevocation } = makeSut({
        reopenAccess: { inReadScope: true, isActing: false, bySubstitute: false },
      });

      await expect(service.reopen(actor, 'tr-1')).rejects.toMatchObject({
        constructor: TransferRevocationRefusedError,
        code: 'NOT_IN_CHARGE',
      });
      expect(openRevocation).not.toHaveBeenCalled();
    });

    it('throws REVOCATION_NOT_DUE when grace has not ended yet', async () => {
      const { service } = makeSut({ locked: heldTransfer({ graceEndsOn: '2026-11-25' }) });

      await expect(service.reopen(actor, 'tr-1')).rejects.toMatchObject({
        constructor: TransferRevocationRefusedError,
        code: 'REVOCATION_NOT_DUE',
      });
    });

    it('throws NOTHING_TO_REVOKE when openRevocation creates or adds nothing', async () => {
      const { service } = makeSut({
        openRevocationResult: { taskId: 'task-1', created: false, reasonAdded: false, status: 'QUEUED' },
      });

      await expect(service.reopen(actor, 'tr-1')).rejects.toMatchObject({
        constructor: TransferRevocationRefusedError,
        code: 'NOTHING_TO_REVOKE',
      });
    });

    it('reopens with noReopenAfterFailure: false and actor, returning created and reasonAdded counts', async () => {
      const { service, openRevocation, auditRecord } = makeSut();

      const result = await service.reopen(actor, 'tr-1', new Date('2026-11-21T10:00:00Z'));

      expect(result).toEqual({ created: 1, reasonAdded: 0 });
      expect(openRevocation).toHaveBeenCalledWith(
        expect.anything(),
        actor,
        expect.objectContaining({ assignmentId: 'asg-1', source: 'TRANSFER', noReopenAfterFailure: false }),
      );
      expect(auditRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'DEPARTMENT_TRANSFER.REVOCATION_OPENED', actorKind: 'USER' }),
      );
      const recordedEvent = (auditRecord.mock.calls[0] as [unknown, { after: Record<string, unknown> }])[1];
      expect(recordedEvent.after).not.toHaveProperty('bySubstitute');
    });

    it('records bySubstitute: true in audit after when reopened by an active substitute', async () => {
      const { service, auditRecord } = makeSut({
        reopenAccess: { inReadScope: true, isActing: true, bySubstitute: true },
      });

      const result = await service.reopen(actor, 'tr-1', new Date('2026-11-21T10:00:00Z'));

      expect(result).toEqual({ created: 1, reasonAdded: 0 });
      expect(auditRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'DEPARTMENT_TRANSFER.REVOCATION_OPENED',
          actorKind: 'USER',
          after: { employeeId: 'emp-1', tasksCreated: 1, reasonsAdded: 0, bySubstitute: true },
        }),
      );
    });
  });
});
