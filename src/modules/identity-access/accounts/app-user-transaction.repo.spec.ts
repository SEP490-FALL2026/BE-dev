import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AppUserRepo } from './app-user.repo';

/** P23-RV-02: the usable IT Admin read runs on the transaction it is given, never on the repository's own client. */
describe('AppUserRepo.findUsableItAdminEmployeeIds on the caller transaction', () => {
  it('queries through the transaction', async () => {
    const prisma = { appUser: { findMany: jest.fn() } };
    const findMany = jest.fn().mockResolvedValue([{ employeeId: 'e-1' }]);
    const repo = new AppUserRepo(prisma as unknown as PrismaService);

    await expect(
      repo.findUsableItAdminEmployeeIds(['e-1', 'e-2'], { appUser: { findMany } } as unknown as DbTx),
    ).resolves.toEqual(new Set(['e-1']));
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(prisma.appUser.findMany).not.toHaveBeenCalled();
  });
});
