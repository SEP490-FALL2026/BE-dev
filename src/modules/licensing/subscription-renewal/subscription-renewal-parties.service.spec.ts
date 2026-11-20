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

describe('the IT Admin of a renewal period (QĐ-113g, BB-9)', () => {
  const pool = { responsibleItAdminEmployeeId: 'it-sub' as string | null };

  const world = (usable: readonly string[], firstUsable: string | null = null) => {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(usable));
    const findFirstUsableItAdminEmployeeId = jest.fn().mockResolvedValue(firstUsable);
    const service = new RenewalPartiesService({
      findUsableItAdminEmployeeIds,
      findFirstUsableItAdminEmployeeId,
    } as unknown as IdentityAccessApi);

    return { service, findUsableItAdminEmployeeIds, findFirstUsableItAdminEmployeeId };
  };

  it('names the one responsible while they are usable and never reads the first usable one', async () => {
    const w = world(['it-sub'], 'it-first');

    expect(await w.service.itAdminOf(pool)).toBe('it-sub');
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub'], undefined);
    expect(w.findFirstUsableItAdminEmployeeId).not.toHaveBeenCalled();
  });

  it('names the first usable IT Admin when the one responsible is gone or none is named', async () => {
    expect(await world([], 'it-first').service.itAdminOf(pool)).toBe('it-first');
    const none = world([], 'it-first');
    expect(await none.service.itAdminOf({ responsibleItAdminEmployeeId: null })).toBe('it-first');
    expect(none.findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });

  it('is nobody when none is usable, and hands the transaction of the caller to every read', async () => {
    const tx = {} as unknown as DbTx;
    const w = world([], null);

    expect(await w.service.itAdminOf(pool, tx)).toBeNull();
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub'], tx);
    expect(w.findFirstUsableItAdminEmployeeId).toHaveBeenCalledWith(tx);
  });

  describe('who records on behalf of the one responsible (QĐ-58b)', () => {
    it('is a substitute when the one responsible still works and is someone else', async () => {
      const w = world(['it-sub']);

      expect(await w.service.substituteOf({ employeeId: 'it-other' }, pool)).toEqual({
        substitute: true,
        responsibleItAdminEmployeeId: 'it-sub',
      });
    });

    it('is not a substitute for the one responsible, and nobody is replaced when they are gone or none is named', async () => {
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
});
