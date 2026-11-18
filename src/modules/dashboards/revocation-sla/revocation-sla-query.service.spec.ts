import { rangeOf } from './revocation-sla-query.service';

describe('rangeOf: the days the windows open on, when the report is asked for fewer than two', () => {
  const today = '2026-11-14';

  it.each<[string, { from?: string; to?: string }, { from: string; to: string }]>([
    ['neither: this month up to today', {}, { from: '2026-11-01', to: '2026-11-14' }],
    ['only the end: from the first of its month', { to: '2026-10-20' }, { from: '2026-10-01', to: '2026-10-20' }],
    ['only the start: up to today', { from: '2026-11-05' }, { from: '2026-11-05', to: '2026-11-14' }],
    [
      'only a start far back: no further than a year on (the report reads at most 366 days)',
      { from: '2025-01-01' },
      { from: '2025-01-01', to: '2026-01-01' },
    ],
    ['both: as asked', { from: '2026-09-01', to: '2026-09-30' }, { from: '2026-09-01', to: '2026-09-30' }],
  ])('%s', (_name, query, range) => {
    expect(rangeOf(query, today)).toEqual(range);
  });
});
