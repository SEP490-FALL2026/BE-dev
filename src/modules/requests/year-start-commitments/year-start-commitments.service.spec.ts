import { Logger } from '@nestjs/common';
import { YearStartCommitmentsService } from './year-start-commitments.service';

const tx = { tx: true };
const ORG = { id: 'org-1', name: 'Acme', timeZone: 'Asia/Ho_Chi_Minh', reportingCurrency: 'VND' };

/** The service over stand-ins: every step runs its function in the same transaction, the mark answers as each test says. */
function setup(today = '2027-01-01') {
  const repo = {
    tryLockPass: jest.fn().mockResolvedValue(true),
    // No mark when the pass opens; the mark it began, open, for each batch after.
    findRun: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ completed: false, resumeAfterId: null }),
    earlierRunYears: jest.fn().mockResolvedValue([2026]),
    firstRequestAt: jest.fn().mockResolvedValue(null),
    markBaseline: jest.fn().mockResolvedValue(undefined),
    begin: jest.fn().mockResolvedValue(true),
    advance: jest.fn().mockResolvedValue(undefined),
    complete: jest.fn().mockResolvedValue({ runCount: 1, created: 0, skipped: 0 }),
  };
  const batches = { commitBatch: jest.fn().mockResolvedValue({ lastId: null, created: 0, skipped: 0 }) };
  const organization = {
    getOrganization: jest.fn().mockResolvedValue(ORG),
    businessToday: jest.fn().mockResolvedValue(today),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const runner = { run: jest.fn((work: (t: unknown) => Promise<unknown>) => work(tx)) };
  const service = new YearStartCommitmentsService(
    runner as never,
    repo as never,
    batches as never,
    organization as never,
    audit as never,
  );

  return { service, repo, batches, audit };
}

describe('YearStartCommitmentsService (BR-MF1-09e: one pass of 01/01 for a year)', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('which pass there is to make', () => {
    it('BR-MF1-09e: an organization with no mark and no request of an earlier year is new: the year is only marked', async () => {
      const { service, repo, batches } = setup();
      repo.earlierRunYears.mockResolvedValue([]);
      repo.firstRequestAt.mockResolvedValue(new Date('2027-01-01T03:00:00.000Z'));

      expect(await service.run(new Date())).toEqual({ status: 'BASELINE', year: 2027 });
      expect(repo.markBaseline).toHaveBeenCalledWith(tx, 'org-1', 2027, expect.any(Date));
      expect(batches.commitBatch).not.toHaveBeenCalled();
    });

    it('BR-MF1-09e: an organization made in December whose first pass is after midnight of 01/01 makes the commitments of its requests of December', async () => {
      const { service, repo, batches } = setup();
      repo.earlierRunYears.mockResolvedValue([]);
      // 28/12/2026 in Ho Chi Minh City.
      repo.firstRequestAt.mockResolvedValue(new Date('2026-12-28T03:00:00.000Z'));
      repo.complete.mockResolvedValue({ runCount: 1, created: 3, skipped: 0 });

      expect(await service.run(new Date())).toMatchObject({ status: 'COMPLETED', year: 2027, created: 3 });
      expect(repo.markBaseline).not.toHaveBeenCalled();
      expect(batches.commitBatch).toHaveBeenCalled();
    });

    it('BR-MF1-09e: the day of the request is the one of the organization: 31/12 at 20:00 UTC is already 01/01 there, and the request is new', async () => {
      const { service, repo } = setup();
      repo.earlierRunYears.mockResolvedValue([]);
      repo.firstRequestAt.mockResolvedValue(new Date('2026-12-31T20:00:00.000Z'));

      expect(await service.run(new Date())).toEqual({ status: 'BASELINE', year: 2027 });
    });

    it('BR-MF1-09e: a year after a year with no pass runs, and the gap is logged', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service, repo } = setup();
      repo.earlierRunYears.mockResolvedValue([2025]);

      expect(await service.run(new Date())).toMatchObject({ status: 'COMPLETED', year: 2027 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('No pass of 01/01 was made for 2026'));
    });

    it('BR-MF1-09e: a year whose mark is complete is not read again', async () => {
      const { service, repo, batches } = setup();
      repo.findRun.mockReset().mockResolvedValue({ completed: true, resumeAfterId: null });

      expect(await service.run(new Date())).toEqual({ status: 'ALREADY_DONE', year: 2027 });
      expect(repo.begin).not.toHaveBeenCalled();
      expect(batches.commitBatch).not.toHaveBeenCalled();
    });
  });

  describe('one instance at a time, and a pass that failed goes on where it stopped', () => {
    it('BR-MF1-09e: an instance that finds the lock of the pass taken leaves the pass to the one that holds it, and counts no pass', async () => {
      const { service, repo, batches } = setup();
      repo.tryLockPass.mockResolvedValue(false);

      expect(await service.run(new Date())).toEqual({ status: 'BUSY', year: 2027 });
      expect(repo.begin).not.toHaveBeenCalled();
      expect(batches.commitBatch).not.toHaveBeenCalled();
    });

    it('BR-MF1-09e: an instance that loses the lock between two batches stops, and makes no batch twice', async () => {
      const { service, repo, batches } = setup();
      repo.tryLockPass.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      expect(await service.run(new Date())).toEqual({ status: 'BUSY', year: 2027 });
      expect(batches.commitBatch).not.toHaveBeenCalled();
    });

    it('BR-MF1-09e: each batch begins after the last request the mark names and moves it on; the last completes the mark and tells the year once', async () => {
      const { service, repo, batches, audit } = setup();
      // A pass before this one failed after the request r-050: the mark is open and names it.
      repo.findRun
        .mockReset()
        .mockResolvedValueOnce({ completed: false, resumeAfterId: 'r-050' })
        .mockResolvedValueOnce({ completed: false, resumeAfterId: 'r-050' })
        .mockResolvedValueOnce({ completed: false, resumeAfterId: 'r-150' });
      batches.commitBatch
        .mockResolvedValueOnce({ lastId: 'r-150', created: 4, skipped: 1 })
        .mockResolvedValueOnce({ lastId: null, created: 0, skipped: 0 });
      // The counts of the year: those of a pass that failed half way, and of this one.
      repo.complete.mockResolvedValue({ runCount: 2, created: 9, skipped: 2 });

      const result = await service.run(new Date());

      expect(batches.commitBatch.mock.calls.map((call: unknown[]) => call[2])).toEqual(['r-050', 'r-150']);
      expect(repo.advance).toHaveBeenCalledTimes(1);
      expect(repo.advance).toHaveBeenCalledWith(tx, {
        organizationId: 'org-1',
        year: 2027,
        lastId: 'r-150',
        created: 4,
        skipped: 1,
      });
      expect(result).toEqual({ status: 'COMPLETED', year: 2027, created: 9, skipped: 2, reported: true });
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'BUDGET_COMMITMENT.YEAR_START_RUN',
          actorKind: 'SYSTEM',
          after: { year: 2027, runCount: 2, created: 9, skipped: 2 },
        }),
      );
    });

    it('BR-MF1-09e: a mark that another instance completed meanwhile is left as it is, and nothing is told', async () => {
      const { service, repo, batches, audit } = setup();
      repo.findRun
        .mockReset()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ completed: true, resumeAfterId: 'r-150' });

      expect(await service.run(new Date())).toEqual({ status: 'ALREADY_DONE', year: 2027 });
      expect(batches.commitBatch).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('BR-MF1-09e: the pass is of the year of the day of the organization, and hands that day to the batches', async () => {
      const { service, batches } = setup('2027-02-05');

      await service.run(new Date());

      expect(batches.commitBatch).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ organizationId: 'org-1', year: 2027, today: '2027-02-05' }),
        null,
      );
    });
  });
});
