import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { BudgetProposalLinesInvalidError } from '../budget/budget.errors';
import type { BudgetFactsService } from '../budget/budget-facts.service';
import type { CycleRepo } from '../cycle/cycle.repo';
import { ProposalLineJudge, type ProposalLineDraft } from './proposal-line-judge.service';

const tx = {} as DbTx;
const now = new Date('2026-11-09T00:00:00Z');
const zbb = { purpose: 'p', alternatives: 'a', consequenceIfNot: 'c', usageIndicator: 'u' };

const draft = (patch: Partial<ProposalLineDraft> = {}): ProposalLineDraft => ({
  description: 'Figma',
  planId: null,
  seats: null,
  amountMinor: 10n,
  note: null,
  lineType: 'RENEW',
  zbb: null,
  priorityRank: 1,
  overCeilingMinor: null,
  ...patch,
});

const judgeOf = (
  price: {
    amountMinor: bigint;
    cycle?: string;
    kind?: string;
    currency?: string;
    reporting?: { amountMinor: bigint; currency: string } | null;
  } | null = null,
) => {
  const parameters = {
    getValueAt: jest.fn((key: string) => Promise.resolve(key === 'BUDGET_ZBB_KPI3_BELOW_PERCENT' ? 70 : 10)),
  } as unknown as OperatingParametersApi;
  const catalog = {
    getPlanPrice: jest.fn(() =>
      Promise.resolve(
        price && {
          kind: price.kind ?? 'RECURRING',
          unitPrice: { amountMinor: price.amountMinor, currency: price.currency ?? 'VND' },
          reportingUnitPrice: price.reporting ?? null,
          billingCycle: price.cycle ?? 'MONTHLY',
          allowsMidTermReduction: false,
        },
      ),
    ),
  } as unknown as CatalogApi;

  return new ProposalLineJudge(parameters, catalog, {} as CycleRepo, {} as BudgetFactsService);
};

const input = (lines: ProposalLineDraft[], ceilingMinor: bigint | null = null) => ({
  lines,
  ceilingMinor,
  currency: 'VND',
  now,
});

const refusal = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(BudgetProposalLinesInvalidError);

  return error as BudgetProposalLinesInvalidError;
};

describe('the rules of the lines of BM-10 that read more than the line', () => {
  it('QT 4.5: two lines with one rank are refused, naming both positions', async () => {
    const error = await refusal(
      judgeOf().judge(tx, input([draft(), draft({ priorityRank: 2 }), draft({ priorityRank: 1 })])),
    );

    expect([error.rule, error.positions]).toEqual(['PRIORITY_RANK_INVALID', [1, 3]]);
  });

  it('BR-MF4-02: a NEW line without its explanation is refused; with it, accepted', async () => {
    const error = await refusal(judgeOf().judge(tx, input([draft({ lineType: 'NEW' })])));

    expect([error.rule, error.positions]).toEqual(['ZBB_REQUIRED', [1]]);
    await expect(judgeOf().judge(tx, input([draft({ lineType: 'NEW', zbb })]))).resolves.toHaveLength(1);
  });

  it('M-17: the unit price over 110 % of the monthly price of the plan now asks the explanation', async () => {
    // 10 seats at 100 a month = 12 000 a year; 13 320 is 11 % over.
    const line = (amountMinor: bigint) => draft({ planId: 'plan', seats: 10, amountMinor });

    const error = await refusal(judgeOf({ amountMinor: 100n }).judge(tx, input([line(13_320n)])));
    expect(error.rule).toBe('ZBB_REQUIRED');
    await expect(judgeOf({ amountMinor: 100n }).judge(tx, input([line(13_200n)]))).resolves.toHaveLength(1);
  });

  it('M-17: a price in another currency never converted, or of a one-time purchase, is not compared', async () => {
    const line = draft({ planId: 'plan', seats: 10, amountMinor: 999_999n });

    await expect(judgeOf({ amountMinor: 100n, currency: 'USD' }).judge(tx, input([line]))).resolves.toHaveLength(1);
    await expect(judgeOf({ amountMinor: 100n, kind: 'ONE_TIME' }).judge(tx, input([line]))).resolves.toHaveLength(1);
  });

  it('G5-02 M-17: a plan priced in USD is compared by its price converted to the reporting currency', async () => {
    // 15 USD a month recorded as 375 000 VND; 10 seats = 45 000 000 a year; 50% more asks the explanation, 10% does not.
    const figma = { amountMinor: 1_500n, currency: 'USD', reporting: { amountMinor: 375_000n, currency: 'VND' } };
    const line = (amountMinor: bigint) => draft({ planId: 'plan', seats: 10, amountMinor });

    const error = await refusal(judgeOf(figma).judge(tx, input([line(67_500_000n)])));
    expect([error.rule, error.positions]).toEqual(['ZBB_REQUIRED', [1]]);
    await expect(judgeOf(figma).judge(tx, input([line(49_500_000n)]))).resolves.toHaveLength(1);
  });

  it('AC-20: the flag carries the part over the published ceiling and asks a note of the flagged line', async () => {
    const lines = [
      draft({ amountMinor: 50n }),
      draft({ amountMinor: 70n, priorityRank: 2 }),
      draft({ amountMinor: 40n, priorityRank: 3 }),
    ];

    const error = await refusal(judgeOf().judge(tx, input(lines, 90n)));
    expect([error.rule, error.positions]).toEqual(['OVER_CEILING_NOTE_REQUIRED', [2, 3]]);

    const noted = lines.map((entry) => ({ ...entry, note: 'why' }));
    const judged = await judgeOf().judge(tx, input(noted, 90n));
    expect(judged.map((entry) => entry.overCeilingMinor)).toEqual([null, 30n, 40n]);
  });

  it('S4-01: no published ceiling means no flag', async () => {
    const judged = await judgeOf().judge(tx, input([draft({ amountMinor: 999n })], null));

    expect(judged[0].overCeilingMinor).toBeNull();
  });

  it('QĐ-109c: a CANCEL line of 50 million changes neither the flag of the others nor asks a note', async () => {
    const lines = [
      draft({ amountMinor: 50n }),
      draft({ lineType: 'CANCEL', amountMinor: 50_000_000n, priorityRank: 2 }),
      draft({ amountMinor: 30n, priorityRank: 3 }),
    ];

    const judged = await judgeOf().judge(tx, input(lines, 90n));

    expect(judged.map((entry) => entry.overCeilingMinor)).toEqual([null, null, null]);
  });
});
