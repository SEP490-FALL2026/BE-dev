import { YearStartCarriedOverService } from './year-start-carried-over.service';
import type { YearStartCandidate } from './year-start-commitments.repo';

const tx = { tx: true };
const row = (id: string) => ({ id }) as YearStartCandidate;
const commitment = (requestId: string, costCenterId: string, amountMinor: bigint) => ({
  requestId,
  costCenterId,
  amountMinor,
  seatMonthlyMinor: 1_000_000n,
  currency: 'VND',
});

/** The dry run over stand-ins: the batches the repo reads, and what the batch service judges each of them to commit. */
function setup(input: { batches: YearStartCandidate[][]; judged: (ReturnType<typeof commitment>[] | null)[] }) {
  const reads = [...input.batches];
  const judgements = [...input.judged];
  const repo = {
    readBatch: jest.fn<Promise<YearStartCandidate[]>, [unknown, string, string | null, number]>(() =>
      Promise.resolve(reads.shift() ?? []),
    ),
    lockBatch: jest.fn(),
  };
  const batches = {
    judgeBatch: jest.fn(() => {
      const items = judgements.shift() ?? null;

      return Promise.resolve(items === null ? null : { items, leftOut: [], ignored: [] });
    }),
    commitBatch: jest.fn(),
  };
  const organization = {
    getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    businessToday: jest.fn().mockResolvedValue('2026-11-15'),
  };
  const runner = { run: jest.fn((work: (inner: unknown) => Promise<unknown>) => work(tx)) };
  const service = new YearStartCarriedOverService(
    runner as never,
    repo as never,
    batches as never,
    organization as never,
  );

  return { service, repo, batches, organization, runner };
}

describe('YearStartCarriedOverService (QĐ-111ac: what the Cost Centers carry into the year, a dry run of the pass of 01/01)', () => {
  it('QĐ-111ac: reads the requests batch by batch until none is left, judges each as the pass of the year that begins does, and adds what each Cost Center asked about would hold', async () => {
    const { service, repo, batches } = setup({
      batches: [[row('r-1'), row('r-2')], [row('r-3')]],
      judged: [
        [commitment('r-1', 'cc-1', 120_000_000n), commitment('r-2', 'cc-2', 7n)],
        [commitment('r-3', 'cc-1', 3_000_000n)],
      ],
    });

    const carried = await service.carriedOverOf(['cc-1', 'cc-3'], 2027, tx as never);

    expect([...carried]).toEqual([['cc-1', 123_000_000n]]);
    // The second batch begins after the last request of the first, and the pass context is the year that begins.
    expect(repo.readBatch.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ['org-1', null],
      ['org-1', 'r-2'],
      ['org-1', 'r-3'],
    ]);
    expect(batches.judgeBatch.mock.calls[0]).toEqual([
      tx,
      expect.objectContaining({ organizationId: 'org-1', year: 2027 }),
      [row('r-1'), row('r-2')],
    ]);
  });

  it('QĐ-111ac: only reads: it never locks a request and never commits a batch', async () => {
    const { service, repo, batches } = setup({ batches: [[row('r-1')]], judged: [[commitment('r-1', 'cc-1', 5n)]] });

    await service.carriedOverOf(['cc-1'], 2027, tx as never);

    expect(repo.lockBatch).not.toHaveBeenCalled();
    expect(batches.commitBatch).not.toHaveBeenCalled();
  });

  it('QĐ-111ac: a batch with no paid request left (the batch service judges nothing) adds nothing, and the reading goes on', async () => {
    const { service } = setup({
      batches: [[row('r-1')], [row('r-2')]],
      judged: [null, [commitment('r-2', 'cc-1', 9n)]],
    });

    expect([...(await service.carriedOverOf(['cc-1'], 2027, tx as never))]).toEqual([['cc-1', 9n]]);
  });

  it('QĐ-111ac: asked about no Cost Center, it reads nothing', async () => {
    const { service, repo, runner } = setup({ batches: [[row('r-1')]], judged: [[]] });

    expect((await service.carriedOverOf([], 2027)).size).toBe(0);
    expect(repo.readBatch).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('QĐ-111ac: inside a transaction of the caller it opens none; called with none, it reads in one of its own', async () => {
    const own = setup({ batches: [], judged: [] });
    await own.service.carriedOverOf(['cc-1'], 2027, tx as never);
    expect(own.runner.run).not.toHaveBeenCalled();

    const alone = setup({ batches: [], judged: [] });
    await alone.service.carriedOverOf(['cc-1'], 2027);
    expect(alone.runner.run).toHaveBeenCalledTimes(1);
  });

  it('QĐ-111ac: an installation with no organization yet carries nothing', async () => {
    const { service, organization, repo } = setup({ batches: [[row('r-1')]], judged: [[]] });
    organization.getOrganization.mockResolvedValue(null);

    expect((await service.carriedOverOf(['cc-1'], 2027, tx as never)).size).toBe(0);
    expect(repo.readBatch).not.toHaveBeenCalled();
  });
});
