import type { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LicensingApi } from '../../licensing/public/licensing.api';
import type { OrganizationApi } from '../../organization/public/organization.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { TransferClosureService } from './transfer-closure.service';
import type { TransferGraceRepo } from './transfer-grace.repo';
import type { HeldTransfer } from './transfer-grace.types';
import { TransferRevocationRefusedError } from './transfer-revocation.errors';
import { TransferRevocationService } from './transfer-revocation.service';
import type { TransferTellingService } from './transfer-telling.service';

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
    readScope?: string[];
    toDeptActing?: { inCharge?: string | null; substitute?: string | null; usable?: string[] };
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
    const revocationOpened = jest.fn().mockResolvedValue(undefined);
    const actingSpec = options?.toDeptActing ?? { inCharge: actor.employeeId, usable: [actor.employeeId] };
    const usableIds = new Set(actingSpec.usable ?? []);

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
      getItAdminScope: jest.fn().mockResolvedValue(options?.readScope ?? ['dept-2']),
      itAdminsActingFor: jest.fn(
        async (deptIds: readonly string[], usableAmong: (ids: string[]) => Promise<Set<string>>) => {
          const candidates = [actingSpec.inCharge, actingSpec.substitute].filter((id): id is string => Boolean(id));
          const usable = candidates.length === 0 ? new Set<string>() : await usableAmong(candidates);
          const inCharge = actingSpec.inCharge && usable.has(actingSpec.inCharge) ? actingSpec.inCharge : null;
          const substitute = actingSpec.substitute && usable.has(actingSpec.substitute) ? actingSpec.substitute : null;
          const actors = [inCharge, substitute].filter((id): id is string => id !== null);
          return new Map(
            deptIds.map((deptId) => [
              deptId,
              { inCharge, substitute, defaultAssignee: substitute ?? inCharge, actors },
            ]),
          );
        },
      ),
    } as unknown as OrganizationReadApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn((ids: readonly string[]) =>
        Promise.resolve(new Set(ids.filter((id) => usableIds.has(id)))),
      ),
    } as unknown as IdentityAccessApi;
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
    const telling = { revocationOpened } as unknown as TransferTellingService;
    const closing = { closeIfDue: jest.fn().mockResolvedValue(false) } as unknown as TransferClosureService;

    const service = new TransferRevocationService(
      runner,
      graces,
      organization,
      organizationReads,
      identity,
      licensing,
      telling,
      closing,
    );

    return { service, tx, pageGraceOver, openRevocation, revocationOpened };
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
      const { service, openRevocation } = makeSut({ readScope: ['other-dept'] });

      await expect(service.reopen(actor, 'tr-1')).rejects.toMatchObject({
        constructor: TransferRevocationRefusedError,
        code: 'NOT_FOUND',
      });
      expect(openRevocation).not.toHaveBeenCalled();
    });

    it('throws NOT_IN_CHARGE when actor is in read scope but not acting for destination department', async () => {
      const { service, openRevocation } = makeSut({
        readScope: ['dept-1'],
        toDeptActing: { inCharge: 'it-other', usable: ['it-other'] },
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
      const { service, openRevocation, revocationOpened } = makeSut();

      const result = await service.reopen(actor, 'tr-1', new Date('2026-11-21T10:00:00Z'));

      expect(result).toEqual({ created: 1, reasonAdded: 0 });
      expect(openRevocation).toHaveBeenCalledWith(
        expect.anything(),
        actor,
        expect.objectContaining({ assignmentId: 'asg-1', source: 'TRANSFER', noReopenAfterFailure: false }),
      );
      expect(revocationOpened).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'tr-1' }),
        { created: 1, reasonAdded: 0 },
        actor,
        false,
      );
    });

    it('passes bySubstitute: true when reopened by an active substitute', async () => {
      const { service, revocationOpened } = makeSut({
        readScope: ['dept-2'],
        toDeptActing: { inCharge: 'it-locked', substitute: actor.employeeId, usable: [actor.employeeId] },
      });

      const result = await service.reopen(actor, 'tr-1', new Date('2026-11-21T10:00:00Z'));

      expect(result).toEqual({ created: 1, reasonAdded: 0 });
      expect(revocationOpened).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'tr-1' }),
        { created: 1, reasonAdded: 0 },
        actor,
        true,
      );
    });
  });

  describe('resolveReopenAccess', () => {
    const transfer = { fromDepartmentId: 'dept-1', toDepartmentId: 'dept-2' };

    it('returns inReadScope: false when actor read scope covers neither department', async () => {
      const { service, tx } = makeSut({ readScope: ['other-dept'] });

      await expect(service.resolveReopenAccess(tx, actor.employeeId, transfer)).resolves.toEqual({
        inReadScope: false,
        isActing: false,
        bySubstitute: false,
      });
    });

    it('returns inReadScope: true and isActing: false when actor only sees fromDepartmentId', async () => {
      const { service, tx } = makeSut({
        readScope: ['dept-1'],
        toDeptActing: { inCharge: 'it-to', usable: ['it-to'] },
      });

      await expect(service.resolveReopenAccess(tx, actor.employeeId, transfer)).resolves.toEqual({
        inReadScope: true,
        isActing: false,
        bySubstitute: false,
      });
    });

    it('returns isActing: true and bySubstitute: false for usable in-charge of toDepartmentId', async () => {
      const { service, tx } = makeSut({
        readScope: ['dept-2'],
        toDeptActing: { inCharge: actor.employeeId, usable: [actor.employeeId] },
      });

      await expect(service.resolveReopenAccess(tx, actor.employeeId, transfer)).resolves.toEqual({
        inReadScope: true,
        isActing: true,
        bySubstitute: false,
      });
    });

    it('returns isActing: true and bySubstitute: true for active substitute of toDepartmentId', async () => {
      const { service, tx } = makeSut({
        readScope: ['dept-2'],
        toDeptActing: { inCharge: 'it-locked', substitute: actor.employeeId, usable: [actor.employeeId] },
      });

      await expect(service.resolveReopenAccess(tx, actor.employeeId, transfer)).resolves.toEqual({
        inReadScope: true,
        isActing: true,
        bySubstitute: true,
      });
    });
  });
});
