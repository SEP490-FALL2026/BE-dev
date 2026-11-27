import type { BusinessDate } from '../../../core/business-date';
import { chooseLine, isLineServingOn, type LineCandidate } from './subscription-line.policy';

const line = (overrides: Partial<LineCandidate> = {}): LineCandidate => ({
  id: 'line-1',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  free: 1,
  ledgerOpenedOn: '2026-07-01',
  closedOn: null,
  subscription: {
    status: 'ACTIVE',
    startDate: '2026-07-01',
    endDate: '2027-06-30',
  },
  ...overrides,
});

describe('isLineServingOn', () => {
  it.each<{
    label: string;
    candidate: Partial<LineCandidate>;
    day: BusinessDate;
    expected: boolean;
  }>([
    {
      label: 'active line serving inside period and after ledger opened',
      candidate: {},
      day: '2026-11-21',
      expected: true,
    },
    {
      label: 'boundary: day equals ledgerOpenedOn',
      candidate: { ledgerOpenedOn: '2026-11-25' },
      day: '2026-11-25',
      expected: true,
    },
    {
      label: 'day before ledgerOpenedOn does not serve',
      candidate: { ledgerOpenedOn: '2026-11-25' },
      day: '2026-11-24',
      expected: false,
    },
    {
      label: 'line without ledger (historical active period) serves inside period',
      candidate: { ledgerOpenedOn: null },
      day: '2026-11-21',
      expected: true,
    },
    {
      label: 'RENEWED line still serves before closedOn (Q-C)',
      candidate: { closedOn: '2027-06-30' },
      day: '2027-06-20',
      expected: true,
    },
    {
      label: 'boundary: RENEWED line still serves on closedOn',
      candidate: { closedOn: '2027-06-30' },
      day: '2027-06-30',
      expected: true,
    },
    {
      label: 'RENEWED line stops serving the day after closedOn',
      candidate: { closedOn: '2027-06-30' },
      day: '2027-07-01',
      expected: false,
    },
    {
      label: 'day before subscription startDate does not serve',
      candidate: {
        ledgerOpenedOn: '2027-07-01',
        subscription: { status: 'ACTIVE', startDate: '2027-07-01', endDate: '2028-06-30' },
      },
      day: '2027-06-20',
      expected: false,
    },
    {
      label: 'day after subscription endDate does not serve',
      candidate: {},
      day: '2027-07-01',
      expected: false,
    },
    {
      label: 'DRAFT period never serves',
      candidate: { subscription: { status: 'DRAFT', startDate: '2026-07-01', endDate: '2027-06-30' } },
      day: '2026-11-21',
      expected: false,
    },
  ])('$label', ({ candidate, day, expected }) => {
    const built = line(candidate);
    expect(isLineServingOn(built, day, built.subscription)).toBe(expected);
  });
});

describe('chooseLine', () => {
  it('picks the old RENEWED line still serving on 2027-06-20 over the future period starting 2027-07-01 (Q-C)', () => {
    const oldLine = line({
      id: 'line-old',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      free: 1,
      ledgerOpenedOn: '2026-07-01',
      closedOn: '2027-06-30',
      subscription: { status: 'ACTIVE', startDate: '2026-07-01', endDate: '2027-06-30' },
    });
    const nextLine = line({
      id: 'line-next',
      createdAt: new Date('2027-05-28T00:00:00.000Z'),
      free: 5,
      ledgerOpenedOn: '2027-07-01',
      closedOn: null,
      subscription: { status: 'ACTIVE', startDate: '2027-07-01', endDate: '2028-06-30' },
    });

    expect(chooseLine([nextLine, oldLine], '2027-06-20')?.id).toBe('line-old');
    expect(chooseLine([nextLine, oldLine], '2027-07-01')?.id).toBe('line-next');
  });

  it('prefers a serving line with free seats over an older full line', () => {
    const olderFull = line({
      id: 'line-a',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      free: 0,
    });
    const newerFree = line({
      id: 'line-b',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      free: 1,
    });

    expect(chooseLine([olderFull, newerFree], '2026-11-21')?.id).toBe('line-b');
  });

  it('within lines with free seats, orders by createdAt then id (not by highest free count)', () => {
    const olderLessFree = line({
      id: 'line-b',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      free: 1,
    });
    const newerMoreFree = line({
      id: 'line-a',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      free: 10,
    });
    const sameCreatedSmallerId = line({
      id: 'line-a-tie',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      free: 2,
    });

    expect(chooseLine([newerMoreFree, olderLessFree], '2026-11-21')?.id).toBe('line-b');
    expect(chooseLine([olderLessFree, sameCreatedSmallerId], '2026-11-21')?.id).toBe('line-a-tie');
  });

  it('when all serving lines are full, picks oldest createdAt then id', () => {
    const fullB = line({ id: 'line-b', createdAt: new Date('2026-01-01T00:00:00.000Z'), free: 0 });
    const fullA = line({ id: 'line-a', createdAt: new Date('2026-01-01T00:00:00.000Z'), free: 0 });
    const fullLater = line({ id: 'line-0', createdAt: new Date('2026-02-01T00:00:00.000Z'), free: 0 });

    expect(chooseLine([fullLater, fullB, fullA], '2026-11-21')?.id).toBe('line-a');
  });

  it('returns null when no line serves the day', () => {
    const closed = line({ closedOn: '2026-10-31' });
    expect(chooseLine([closed], '2026-11-21')).toBeNull();
  });
});
