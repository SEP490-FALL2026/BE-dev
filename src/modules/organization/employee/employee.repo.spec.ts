import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { Prisma } from '../../../generated/prisma/client';
import { FirstPlacementCorrectionError } from './employee.errors';
import { EmployeeRepo } from './employee.repo';

/**
 * The private reads behind the onboarding facts run on the client they are given. With a transaction, the
 * service's own Prisma client is never touched.
 */
describe('employee reads of the onboarding facts on the caller transaction', () => {
  const untouched = new Proxy(
    {},
    {
      get: (_target, property) => {
        throw new Error(`the service client was used (${String(property)}) instead of the transaction`);
      },
    },
  ) as PrismaService;

  it('counts the active employees through the transaction', async () => {
    const used: string[] = [];
    const tx = {
      employee: { count: jest.fn(() => (used.push('employee.count'), Promise.resolve(2))) },
    } as unknown as DbTx;

    await expect(new EmployeeRepo(untouched).countActive(tx)).resolves.toBe(2);

    expect(used).toEqual(['employee.count']);
  });
});

/** The trigger of the correction of a first placement refuses with `55000`: that is the 409 of a placement that took effect, not a 500. */
describe('correctFirstPlacement when the database refuses', () => {
  const untouched = {} as PrismaService;
  const refusal = (state: string) =>
    new Prisma.PrismaClientKnownRequestError('refused', {
      code: 'P2010',
      clientVersion: 'test',
      meta: { driverAdapterError: { cause: { originalCode: state } } },
    });
  const txFailingWith = (error: unknown) =>
    ({ employeePlacement: { update: jest.fn().mockRejectedValue(error) } }) as unknown as DbTx;

  it('maps object_not_in_prerequisite_state to ALREADY_EFFECTIVE', async () => {
    const failure: unknown = await new EmployeeRepo(untouched)
      .correctFirstPlacement(txFailingWith(refusal('55000')), 'pl-1', { departmentId: 'dep-1' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FirstPlacementCorrectionError);
    expect((failure as FirstPlacementCorrectionError).problem).toBe('ALREADY_EFFECTIVE');
  });

  it('lets any other failure through', async () => {
    const other = refusal('23505');
    await expect(
      new EmployeeRepo(untouched).correctFirstPlacement(txFailingWith(other), 'pl-1', { departmentId: 'dep-1' }),
    ).rejects.toBe(other);
  });
});
