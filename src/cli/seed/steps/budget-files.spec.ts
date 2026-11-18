import ExcelJS from 'exceljs';
import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { fakeBm10Template } from './bm10-template.fake';
import { fitLines, proposalFile, reservePercentOf, versionFile } from './budget-files';

/** A client that answers by "METHOD path" and remembers what it was asked. */
function fakeContext(answers: Record<string, unknown>, bytes?: Uint8Array) {
  const asked: string[] = [];
  const call = jest.fn((email: string, method: string, path: string) => {
    asked.push(`${method} ${path}`);
    const answer = answers[`${method} ${path}`];

    return answer === undefined ? Promise.reject(new Error(`unexpected ${method} ${path}`)) : Promise.resolve(answer);
  });
  const download = jest.fn((email: string, path: string) => {
    asked.push(`DOWNLOAD ${email} ${path}`);

    return Promise.resolve(bytes ?? new Uint8Array());
  });
  const ctx = {
    fixture: SHARED_DEMO_V4,
    today: '2026-11-17',
    superAdminEmail: 'sa@example.test',
    api: { call, download },
  } as unknown as DemoRunContext;

  return { ctx, asked };
}

const parameters = {
  items: [
    { key: 'OTHER', value: 1 },
    { key: 'BUDGET_RESERVE_DEFAULT_PERCENT', value: 10 },
  ],
};

describe('the default share of reserve the files state', () => {
  it('is read from the operating parameters once in a run, as the Super Admin', async () => {
    const { ctx, asked } = fakeContext({ 'GET /operating-parameters': parameters });

    await expect(reservePercentOf(ctx)).resolves.toBe(10);
    await expect(reservePercentOf(ctx)).resolves.toBe(10);
    expect(asked).toEqual(['GET /operating-parameters']);
  });

  it('is never guessed: a parameter without a number is a failure', async () => {
    const { ctx } = fakeContext({
      'GET /operating-parameters': { items: [{ key: 'BUDGET_RESERVE_DEFAULT_PERCENT', value: null }] },
    });

    await expect(reservePercentOf(ctx)).rejects.toThrow(/BUDGET_RESERVE_DEFAULT_PERCENT/);
  });
});

describe('the BM-10 a head sends', () => {
  it('is the template the head downloads, in the name of the head, with the lines of the fixture and the share read from the API', async () => {
    const { ctx, asked } = fakeContext({ 'GET /operating-parameters': parameters }, await fakeBm10Template());
    const file = await proposalFile(ctx, 'cuong.le@saoviet.example', { department: 'ENG', amount: '600000000' }, 2026);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(file.bytes) as unknown as ExcelJS.Buffer);
    const text = JSON.stringify(book.worksheets[0].getSheetValues());

    expect(asked).toContain('DOWNLOAD cuong.le@saoviet.example /import-templates/budget-proposal?format=xlsx');
    expect(file.fileName).toBe('BM-10-ENG-2026.xlsx');
    expect(text).toContain('Lê Minh Cường');
    expect(text).toContain('CC-ENG');
    expect(text).toContain('Dự phòng đề xuất (10 %)');
    expect(text).toContain('600000000');
  });
});

describe('the file Finance attaches to a version', () => {
  it('holds the figures the system gives right before: the version, and the proposal it came from', async () => {
    const version = {
      costCenter: { code: 'CC-FIN' },
      year: 2026,
      number: 1,
      proposalId: 'p-1',
      base: { amount: '48000000' },
      reserve: { amount: '4800000' },
      reservePercent: 10,
      reserveReason: null,
      baseReason: null,
    };
    const { ctx, asked } = fakeContext({
      'GET /operating-parameters': parameters,
      'GET /budget-versions/v-1': { version },
      'GET /budget-proposals/p-1': { proposal: { requestedAmount: { amount: '50000000' } } },
    });
    const file = await versionFile(ctx, 'ngoc.phan@saoviet.example', 'v-1', 'phien-ban-FIN-2026.xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(file.bytes) as unknown as ExcelJS.Buffer);
    const text = JSON.stringify(book.worksheets[0].getSheetValues());

    expect(asked).toEqual(expect.arrayContaining(['GET /budget-versions/v-1', 'GET /budget-proposals/p-1']));
    expect(text).toContain('50000000');
    expect(text).toContain('48000000');
    expect(text).toContain('-2000000');
  });
});

/** T9b: the amount of a head is counted from the day of the seed and may be smaller than the lines of the fixture add up to. */
describe('the lines of BM-10 within the amount asked (T9b)', () => {
  const line = (months: number, seats = 4, monthlyPrice = 200_000) => ({
    software: 'Jira',
    plan: 'Standard',
    seats,
    monthlyPrice,
    months,
    reason: 'x',
  });

  it('keeps every line while they fit', () => {
    expect(fitLines([line(12)], 9_600_000)).toEqual([line(12)]);
    expect(fitLines([line(12)], 50_000_000)).toEqual([line(12)]);
  });

  it('cuts a line to the months that fit the amount and leaves out the ones that fit none', () => {
    expect(fitLines([line(12)], 3_000_000)).toEqual([line(3)]);
    expect(fitLines([line(12), { ...line(12), software: 'Slack' }], 3_000_000)).toEqual([
      line(3),
      { ...line(12), software: 'Slack', seats: 3, months: 1 },
    ]);
    expect(fitLines([line(12)], 100_000)).toEqual([]);
  });

  it('cuts a line that fits no month of all its seats to the seats one month pays for', () => {
    expect(fitLines([line(12)], 500_000)).toEqual([{ ...line(12), seats: 2, months: 1 }]);
  });

  it('never adds up to more than the amount, whatever it is', () => {
    for (const amount of [0, 1, 799_999, 800_000, 3_000_000, 9_599_999]) {
      const total = fitLines([line(12), line(6, 2, 180_000)], amount).reduce(
        (sum, l) => sum + l.seats * l.monthlyPrice * l.months,
        0,
      );

      expect(total).toBeLessThanOrEqual(amount);
    }
  });
});
