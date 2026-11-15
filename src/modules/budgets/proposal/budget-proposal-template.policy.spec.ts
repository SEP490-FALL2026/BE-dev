import { definitionProblems } from '../../policies/import-template/import-template.policy';
import { BUDGET_PROPOSAL_TEMPLATE } from './budget-proposal-template.policy';

const SEATS = 2;
const PRICE = 3;
const MONTHS = 4;
const AMOUNT = 5;

/** The form BM-10 is not parsed, so what the spec holds is that it is well formed and its example lines add up (`QĐ-111ab`, `QĐ-111as`). */
describe('the form BM-10', () => {
  it('is a well formed template with an example line', () => {
    expect(definitionProblems(BUDGET_PROPOSAL_TEMPLATE)).toEqual([]);
    expect(BUDGET_PROPOSAL_TEMPLATE.columns.map((column) => column.key)).toEqual([
      'software',
      'plan',
      'seats',
      'monthly_price_vnd',
      'months',
      'amount_vnd',
      'reason',
    ]);
  });

  it('has example lines whose amount is the seats times the price of a month times the months, in whole dong', () => {
    for (const row of BUDGET_PROPOSAL_TEMPLATE.sampleRows) {
      expect(Number(row[SEATS]) * Number(row[PRICE]) * Number(row[MONTHS])).toBe(Number(row[AMOUNT]));
      expect(Number(row[MONTHS])).toBeLessThanOrEqual(12);
    }
  });

  it('asks for no bank statement, no name and no figure in a currency but dong', () => {
    const text = JSON.stringify(BUDGET_PROPOSAL_TEMPLATE).toLowerCase();

    expect(text).not.toContain('sao kê');
    expect(text).not.toContain('usd');
  });
});
