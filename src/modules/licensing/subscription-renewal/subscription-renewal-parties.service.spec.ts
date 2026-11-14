import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RenewalPartiesService } from './subscription-renewal-parties.service';

const principal = (roles: string[]): AuthenticatedPrincipal =>
  ({ appUserId: 'U1', employeeId: 'E1', roles, directRoles: roles }) as unknown as AuthenticatedPrincipal;

const service = (headed: { departmentId: string } | null) =>
  new RenewalPartiesService(
    { getHeadedDepartment: jest.fn().mockResolvedValue(headed) } as unknown as OrganizationReadApi,
    {} as unknown as IdentityAccessApi,
  );

describe('the read scope of the renewals', () => {
  it('lets the head of today read the cases of their department whatever role their account holds (A-M1)', async () => {
    for (const roles of [['MANAGER'], ['EMPLOYEE'], []]) {
      expect(await service({ departmentId: 'D1' }).readScopeOf(principal(roles), '2026-11-06')).toEqual({
        kind: 'DEPARTMENT',
        departmentId: 'D1',
      });
    }
  });

  it('gives nothing to someone who heads no department and is neither IT Admin nor Finance', async () => {
    expect(await service(null).readScopeOf(principal(['EMPLOYEE']), '2026-11-06')).toBeNull();
  });

  it('gives the IT Admin every case and Finance every case to read only', async () => {
    expect(await service(null).readScopeOf(principal(['IT_ADMIN']), '2026-11-06')).toEqual({
      kind: 'ALL',
      itAdmin: true,
    });
    expect(await service(null).readScopeOf(principal(['FINANCE']), '2026-11-06')).toEqual({
      kind: 'ALL',
      itAdmin: false,
    });
  });
});

describe('the IT Admin of a renewal period (QĐ-111g, BB-9)', () => {
  const period = { ownerDepartmentId: 'D1', responsibleItAdminEmployeeId: 'it-sub' as string | null };

  const world = (input: { inCharge: string | null; usable: readonly string[]; firstUsable?: string | null }) => {
    const getItAdminInChargeOfDepartment = jest.fn().mockResolvedValue(input.inCharge);
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(input.usable));
    const findFirstUsableItAdminEmployeeId = jest.fn().mockResolvedValue(input.firstUsable ?? null);
    const service = new RenewalPartiesService(
      { getItAdminInChargeOfDepartment } as unknown as OrganizationReadApi,
      { findUsableItAdminEmployeeIds, findFirstUsableItAdminEmployeeId } as unknown as IdentityAccessApi,
    );

    return { service, getItAdminInChargeOfDepartment, findUsableItAdminEmployeeIds, findFirstUsableItAdminEmployeeId };
  };

  it('asks whether the responsible IT Admin and the one in charge are usable in ONE read, and never reads the first usable one when the responsible one is usable', async () => {
    const w = world({ inCharge: 'it-dept', usable: ['it-sub', 'it-dept'], firstUsable: 'it-first' });

    expect(await w.service.itAdminOf(period)).toBe('it-sub');
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledTimes(1);
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub', 'it-dept'], undefined);
    expect(w.findFirstUsableItAdminEmployeeId).not.toHaveBeenCalled();
  });

  it('answers with the IT Admin in charge of the department when the responsible one is not usable, without the last branch', async () => {
    const w = world({ inCharge: 'it-dept', usable: ['it-dept'], firstUsable: 'it-first' });

    expect(await w.service.itAdminOf(period)).toBe('it-dept');
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledTimes(1);
    expect(w.findFirstUsableItAdminEmployeeId).not.toHaveBeenCalled();
  });

  it('does not take the IT Admin in charge of the department when they have left and are not locked yet: the first usable one answers', async () => {
    const w = world({ inCharge: 'it-left', usable: [], firstUsable: 'it-first' });

    expect(await w.service.itAdminOf(period)).toBe('it-first');
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledTimes(1);
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub', 'it-left'], undefined);
    expect(w.findFirstUsableItAdminEmployeeId).toHaveBeenCalledTimes(1);
  });

  it('reads the first usable IT Admin when the department names none and the subscription names none', async () => {
    const w = world({ inCharge: null, usable: [], firstUsable: 'it-first' });

    expect(await w.service.itAdminOf({ ...period, responsibleItAdminEmployeeId: null })).toBe('it-first');
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith([], undefined);
    expect(w.findFirstUsableItAdminEmployeeId).toHaveBeenCalledTimes(1);
  });

  it('is nobody when none of the three is usable', async () => {
    const w = world({ inCharge: 'it-left', usable: [], firstUsable: null });

    expect(await w.service.itAdminOf(period)).toBeNull();
  });

  it('reads the department first and hands the transaction of the caller to every read', async () => {
    const tx = {} as unknown as DbTx;
    const w = world({ inCharge: 'it-dept', usable: [], firstUsable: 'it-first' });

    await w.service.itAdminOf(period, tx);

    expect(w.getItAdminInChargeOfDepartment).toHaveBeenCalledWith('D1', tx);
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub', 'it-dept'], tx);
    expect(w.findFirstUsableItAdminEmployeeId).toHaveBeenCalledWith(tx);
  });

  it('names the same IT Admin once when the responsible one is also in charge of the department', async () => {
    const w = world({ inCharge: 'it-sub', usable: ['it-sub'] });

    expect(await w.service.itAdminOf(period)).toBe('it-sub');
    expect(w.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub'], undefined);
  });
});
