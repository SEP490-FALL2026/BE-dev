import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { RenewalPartiesService } from './subscription-renewal-parties.service';

const principal = (roles: string[]): AuthenticatedPrincipal =>
  ({ appUserId: 'U1', employeeId: 'E1', roles, directRoles: roles }) as unknown as AuthenticatedPrincipal;

describe('the read scope of the renewals', () => {
  const service = new RenewalPartiesService({} as unknown as IdentityAccessApi);

  it('gives nothing to anyone who is neither IT Admin nor Finance, the head of a department included', () => {
    for (const roles of [['MANAGER'], ['EMPLOYEE'], []]) {
      expect(service.readScopeOf(principal(roles))).toBeNull();
    }
  });

  it('gives the IT Admin every case and Finance every case to read only', () => {
    expect(service.readScopeOf(principal(['IT_ADMIN']))).toEqual({ kind: 'ALL', itAdmin: true });
    expect(service.readScopeOf(principal(['FINANCE']))).toEqual({ kind: 'ALL', itAdmin: false });
  });
});

describe('the IT Admin of a renewal period (H5, H15, Owner Q7)', () => {
  const pool = { responsibleItAdminEmployeeId: 'it-sub' as string | null };

  const world = (usable: readonly string[], superAdmin: string | null = 'super-admin') => {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(usable));
    const findUsableSuperAdminEmployeeId = jest.fn().mockResolvedValue(superAdmin);
    const service = new RenewalPartiesService({
      findUsableItAdminEmployeeIds,
      findUsableSuperAdminEmployeeId,
    } as unknown as IdentityAccessApi);

    return { service, findUsableItAdminEmployeeIds, findUsableSuperAdminEmployeeId };
  };

  it('names the one responsible while they are usable and never reads the Super Admin', async () => {
    const w = world(['it-sub'], 'super-admin');

    expect(await w.service.itAdminOf(pool)).toBe('it-sub');
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub'], undefined);
    expect(w.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
  });

  it('falls back to the usable Super Admin when the responsible IT Admin is unusable or none is named', async () => {
    const unusable = world([], 'super-admin');
    expect(await unusable.service.itAdminOf(pool)).toBe('super-admin');
    expect(unusable.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(undefined);

    const none = world([], 'super-admin');
    expect(await none.service.itAdminOf({ responsibleItAdminEmployeeId: null })).toBe('super-admin');
    expect(none.findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
    expect(none.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(undefined);
  });

  it('returns null when no usable Super Admin exists, and hands the transaction to every read', async () => {
    const tx = {} as unknown as DbTx;
    const w = world([], null);

    expect(await w.service.itAdminOf(pool, tx)).toBeNull();
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub'], tx);
    expect(w.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(tx);
  });

  describe('substituteOf (no temporary substitute per subscription)', () => {
    it('always returns substitute=false, naming the responsible IT Admin only while usable', async () => {
      expect(await world(['it-sub']).service.substituteOf({ employeeId: 'it-other' }, pool)).toEqual({
        substitute: false,
        responsibleItAdminEmployeeId: 'it-sub',
      });
      expect(await world(['it-sub']).service.substituteOf({ employeeId: 'it-sub' }, pool)).toEqual({
        substitute: false,
        responsibleItAdminEmployeeId: 'it-sub',
      });
      expect(await world([]).service.substituteOf({ employeeId: 'it-other' }, pool)).toEqual({
        substitute: false,
        responsibleItAdminEmployeeId: null,
      });

      const none = world([]);
      expect(
        await none.service.substituteOf({ employeeId: 'it-other' }, { responsibleItAdminEmployeeId: null }),
      ).toEqual({ substitute: false, responsibleItAdminEmployeeId: null });
      expect(none.findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
    });

    it('hands the transaction of the caller to the read', async () => {
      const tx = {} as unknown as DbTx;
      const w = world(['it-sub']);

      await w.service.substituteOf({ employeeId: 'it-other' }, pool, tx);

      expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub'], tx);
    });
  });

  describe('who may record a renewal result for the subscription period', () => {
    it('allows only the responsible IT Admin when they are usable, with substitute=false', async () => {
      const tx = {} as unknown as DbTx;
      const w = world(['it-sub']);
      await expect(w.service.recordingAccessOf({ employeeId: 'it-sub' }, pool, tx)).resolves.toEqual({
        allowed: true,
        substitute: false,
        responsibleItAdminEmployeeId: 'it-sub',
      });
      expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub'], tx);
    });

    it('refuses any IT Admin when no responsible IT Admin is assigned', async () => {
      const w = world(['it-other']);
      await expect(
        w.service.recordingAccessOf({ employeeId: 'it-other' }, { responsibleItAdminEmployeeId: null }),
      ).resolves.toEqual({
        allowed: false,
        substitute: false,
        responsibleItAdminEmployeeId: null,
      });
    });

    it('refuses another IT Admin whether the responsible IT Admin is usable or unusable', async () => {
      const active = world(['it-sub']);
      await expect(active.service.recordingAccessOf({ employeeId: 'it-other' }, pool)).resolves.toEqual({
        allowed: false,
        substitute: false,
        responsibleItAdminEmployeeId: 'it-sub',
      });

      const locked = world([]);
      await expect(locked.service.recordingAccessOf({ employeeId: 'it-other' }, pool)).resolves.toEqual({
        allowed: false,
        substitute: false,
        responsibleItAdminEmployeeId: 'it-sub',
      });
    });

    it('refuses the responsible IT Admin themselves if they are no longer a usable IT Admin', async () => {
      const tx = {} as unknown as DbTx;
      const w = world([]);
      await expect(w.service.recordingAccessOf({ employeeId: 'it-sub' }, pool, tx)).resolves.toEqual({
        allowed: false,
        substitute: false,
        responsibleItAdminEmployeeId: 'it-sub',
      });
      expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub'], tx);
    });
  });
});
