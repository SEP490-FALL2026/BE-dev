import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SubscriptionPoolService } from './subscription-pool.service';

const tx = {} as unknown as DbTx;

/** The service with only the two facades a declaration reads the IT Admin through; everything else is a bare stand-in the test never reaches. */
function build(input: { applicationResponsible: string | null; usable: readonly string[] }) {
  const responsibleItAdminIdOf = jest.fn().mockResolvedValue(input.applicationResponsible);
  const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(input.usable));
  const service = new SubscriptionPoolService(
    { findUsableItAdminEmployeeIds } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { responsibleItAdminIdOf } as never,
    {} as never,
  );

  return { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds };
}

describe('the IT Admin a subscription being declared answers to (QĐ-111g)', () => {
  it('is the one the declaration names, and reads nothing', async () => {
    const { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds } = build({
      applicationResponsible: 'it-app',
      usable: ['it-app'],
    });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', 'it-named')).toBe('it-named');
    expect(responsibleItAdminIdOf).not.toHaveBeenCalled();
    expect(findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });

  it('is the IT Admin responsible for the application of the plan, read through the plan, while they are a usable IT Admin', async () => {
    const { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds } = build({
      applicationResponsible: 'it-app',
      usable: ['it-app'],
    });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBe('it-app');
    expect(responsibleItAdminIdOf).toHaveBeenCalledWith('plan-1', tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-app'], tx);
  });

  it('is nobody when the one responsible for the application has left or lost the role', async () => {
    const { service } = build({ applicationResponsible: 'it-gone', usable: [] });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBeNull();
  });

  it('is nobody, and does not ask who is usable, when the application names no IT Admin', async () => {
    const { service, findUsableItAdminEmployeeIds } = build({ applicationResponsible: null, usable: [] });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBeNull();
    expect(findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });
});
