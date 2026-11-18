import { Logger } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { OrganizationChangeService } from './organization-change.service';

const TODAY = '2026-10-31';

describe('OrganizationChangeService.announceDue (a change that could not be told)', () => {
  afterEach(() => jest.restoreAllMocks());

  /** Two placements and one head-period end are due, in this order; each runs in a transaction that ends as `outcomes` say. */
  function build(outcomes: Array<() => Promise<boolean>>) {
    const announcements = {
      duePlacementIds: jest.fn().mockResolvedValue(['placement-1', 'placement-2']),
      dueHeadPeriodIds: jest.fn().mockResolvedValue({ starts: [], ends: ['head-end-1'] }),
    };
    const runner = { run: jest.fn().mockImplementation(() => (outcomes.shift() as () => Promise<boolean>)()) };

    return { service: new OrganizationChangeService({} as never, announcements as never, runner as never), runner };
  }

  it('logs the kind and the id of each change that failed, with the kind of error, and goes on with the next', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, runner } = build([
      () => Promise.reject(new RangeError('listener refused s3cr3t')),
      () => Promise.resolve(true),
      () => Promise.resolve(true),
    ]);

    await expect(service.announceDue(TODAY)).resolves.toEqual({ told: 2, failed: 1 });

    expect(runner.run).toHaveBeenCalledTimes(3);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      'A change of the organization could not be told (placement placement-1): RangeError retryable=false',
      expect.stringMatching(/^\s+at /),
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain('s3cr3t');
  });

  it('logs a head period that failed because the database was unavailable as retryable, with no trace', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service } = build([
      () => Promise.resolve(true),
      () => Promise.resolve(true),
      () => Promise.reject(new TransientDatabaseError('55P03', new Error('lock timeout'))),
    ]);

    await expect(service.announceDue(TODAY)).resolves.toEqual({ told: 2, failed: 1 });

    expect(logged).toHaveBeenCalledWith(
      'A change of the organization could not be told (head period end head-end-1): TransientDatabaseError sqlState=55P03 retryable=true cause=Error',
      undefined,
    );
  });
});
