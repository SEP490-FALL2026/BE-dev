import type { AiToolKey } from '../allowlist/allowlist.policy';
import { contentHashOf, evaluateDays, type DayEvaluationInput, type UsageDayInput } from './ai-usage-day.policy';

const zone = 'Asia/Ho_Chi_Minh';
// The holder acknowledged at 10:00 local on 2026-11-03 (03:00 UTC); the batch was built at 09:00 local on 2026-11-06.
const acceptFromAt = new Date('2026-11-03T03:00:00.000Z');
const generatedAt = new Date('2026-11-06T02:00:00.000Z');
const allowed = new Map<AiToolKey, string>([
  ['CODEX', 'app-codex'],
  ['CLAUDE_CODE', 'app-claude'],
]);

const input = (days: UsageDayInput[], over: Partial<DayEvaluationInput> = {}): DayEvaluationInput => ({
  generatedAt,
  now: new Date('2026-11-06T02:01:00.000Z'),
  acceptFromAt,
  acceptUntilAt: null,
  timeZone: zone,
  days,
  allowedOn: () => allowed,
  ...over,
});
const day = (date: string, coverage: 'COVERED' | 'PARTIAL' | 'NOT_OBSERVABLE', over = {}): UsageDayInput => ({
  date,
  tools: [{ tool: 'CODEX', coverage, responses: 3, totalTokens: 900, ...over }],
});

describe('evaluateDays', () => {
  it('keeps a day inside the window and maps each tool to its application', () => {
    const [verdict] = evaluateDays(input([day('2026-11-04', 'COVERED')]));

    expect(verdict.reason).toBeNull();
    expect(verdict.rows).toEqual([
      {
        tool: 'CODEX',
        applicationId: 'app-codex',
        coverage: 'COVERED',
        responses: 3,
        totalTokens: 900,
        contentHash: contentHashOf({ coverage: 'COVERED', responses: 3, totalTokens: 900 }),
      },
    ]);
  });

  it('refuses every day when the clock of the tool is more than five minutes ahead', () => {
    const verdicts = evaluateDays(input([day('2026-11-04', 'COVERED')], { now: new Date('2026-11-06T01:50:00.000Z') }));

    expect(verdicts.map((verdict) => verdict.reason)).toEqual(['FUTURE_GENERATED_AT']);
  });

  it('refuses a day before the acknowledgement and a day after the build, and keeps the others', () => {
    const verdicts = evaluateDays(
      input([day('2026-11-02', 'PARTIAL'), day('2026-11-03', 'PARTIAL'), day('2026-11-07', 'PARTIAL')]),
    );

    expect(verdicts.map((verdict) => verdict.reason)).toEqual(['OUTSIDE_WINDOW', null, 'OUTSIDE_WINDOW']);
  });

  it('refuses days after the stop and accepts the day of the stop as partial only', () => {
    const stopped = new Date('2026-11-05T05:00:00.000Z');
    const verdicts = evaluateDays(
      input([day('2026-11-05', 'PARTIAL'), day('2026-11-05', 'COVERED'), day('2026-11-06', 'PARTIAL')], {
        acceptUntilAt: stopped,
      }),
    );

    expect(verdicts.map((verdict) => verdict.reason)).toEqual([null, 'INVALID_COVERAGE', 'OUTSIDE_WINDOW']);
  });

  it('allows covered only for a day that lies whole inside the window, and partial on the day of the acknowledgement', () => {
    const verdicts = evaluateDays(
      input([day('2026-11-03', 'COVERED'), day('2026-11-04', 'COVERED'), day('2026-11-06', 'COVERED')]),
    );

    expect(verdicts.map((verdict) => verdict.reason)).toEqual(['INVALID_COVERAGE', null, 'INVALID_COVERAGE']);
  });

  it('refuses a day that says nothing could be observed but counts something', () => {
    const verdicts = evaluateDays(
      input([
        day('2026-11-04', 'NOT_OBSERVABLE', { responses: 0, totalTokens: 0 }),
        day('2026-11-05', 'NOT_OBSERVABLE'),
      ]),
    );

    expect(verdicts.map((verdict) => verdict.reason)).toEqual([null, 'INVALID_COVERAGE']);
  });

  it('refuses a whole day that carries a tool which was not on the allowlist that day', () => {
    const [verdict] = evaluateDays(
      input([
        {
          date: '2026-11-04',
          tools: [
            day('2026-11-04', 'PARTIAL').tools[0],
            { tool: 'ANTIGRAVITY_CLI', coverage: 'PARTIAL', responses: 1, totalTokens: 1 },
          ],
        },
      ]),
    );

    expect(verdict).toMatchObject({ reason: 'NOT_IN_ALLOWLIST', rows: [] });
  });

  it('judges the allowlist for each day on its own', () => {
    const verdicts = evaluateDays(
      input([day('2026-11-04', 'PARTIAL'), day('2026-11-05', 'PARTIAL')], {
        allowedOn: (date) => (date === '2026-11-05' ? new Map() : allowed),
      }),
    );

    expect(verdicts.map((verdict) => verdict.reason)).toEqual([null, 'NOT_IN_ALLOWLIST']);
  });

  it('refuses everything when the machine accepts nothing', () => {
    const verdicts = evaluateDays(input([day('2026-11-04', 'PARTIAL')], { acceptFromAt: null }));

    expect(verdicts.map((verdict) => verdict.reason)).toEqual(['OUTSIDE_WINDOW']);
  });
});

describe('contentHashOf', () => {
  it('tells two builds of the same time apart by what they count', () => {
    const a = contentHashOf({ coverage: 'COVERED', responses: 1, totalTokens: 10 });

    expect(a).toBe(contentHashOf({ coverage: 'COVERED', responses: 1, totalTokens: 10 }));
    expect(a).not.toBe(contentHashOf({ coverage: 'COVERED', responses: 2, totalTokens: 10 }));
    expect(a).not.toBe(contentHashOf({ coverage: 'PARTIAL', responses: 1, totalTokens: 10 }));
  });
});
