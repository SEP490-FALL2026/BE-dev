import type { AssignmentRecord } from '../public/licensing.types';
import { effectiveFromLabel, toAssignmentView, usableDayOf } from './assignment.policy';

const bot: AssignmentRecord = {
  id: 'a1',
  source: 'BASELINE',
  kind: 'SERVICE',
  planId: 'p1',
  subscriptionId: 's1',
  employeeId: 'e2',
  accountIdentifier: 'ci-bot',
  reason: 'CI pipeline',
  costCenterId: 'cc-des',
  owningDepartmentId: 'd-des',
  effectiveFrom: '2026-10-01',
  effectiveFromBasis: 'ACTUAL',
  validUntil: null,
  expectedEndDate: null,
  predecessorId: null,
  isMachineAccount: false,
  machineAccountNote: null,
  failedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
};

describe('effectiveFromLabel (AC-8, QĐ-43b: a recorded start is never shown as a grant date)', () => {
  it('says the real grant date is not known when the start is only the day of recording', () => {
    expect(effectiveFromLabel('RECORDED', '2026-10-01')).toBe('ghi nhận từ 01/10/2026 — ngày cấp thật chưa biết');
  });

  it('says nothing when the grant date is the real one', () => {
    expect(effectiveFromLabel('ACTUAL', '2025-03-15')).toBeNull();
  });
});

describe('toAssignmentView', () => {
  it('shows a real start as the grant date', () => {
    expect(toAssignmentView({ ...bot, effectiveFrom: '2025-03-15', effectiveFromBasis: 'ACTUAL' })).toMatchObject({
      effectiveFrom: '2025-03-15',
      grantedOn: '2025-03-15',
      effectiveFromLabel: null,
    });
  });

  it('shows no grant date and the label for a start that is only the day of recording', () => {
    expect(toAssignmentView({ ...bot, effectiveFrom: '2026-10-01', effectiveFromBasis: 'RECORDED' })).toMatchObject({
      effectiveFrom: '2026-10-01',
      effectiveFromBasis: 'RECORDED',
      grantedOn: null,
      effectiveFromLabel: 'ghi nhận từ 01/10/2026 — ngày cấp thật chưa biết',
    });
  });
});

describe('usableDayOf — M5-01 (FR-4.9 gate 4, QĐ-77n)', () => {
  const day = (instant: Date) => instant.toISOString().slice(0, 10);

  it('is null while a grant task of the first link is still open: the invitation waits', () => {
    expect(usableDayOf('2026-06-01', [{ status: 'QUEUED', completedAt: null }], day)).toBeNull();
    expect(usableDayOf('2026-06-01', [{ status: 'IN_PROGRESS', completedAt: null }], day)).toBeNull();
    expect(usableDayOf('2026-06-01', [{ status: 'FAILED', completedAt: null }], day)).toBeNull();
  });

  it('is the day the grant was completed when it is after valid_from', () => {
    expect(
      usableDayOf('2026-06-01', [{ status: 'COMPLETED', completedAt: new Date('2026-06-20T03:00:00Z') }], day),
    ).toBe('2026-06-20');
  });

  it('is valid_from when no grant task was made (a recorded or baseline seat) or the grant was done before it', () => {
    expect(usableDayOf('2026-06-01', [], day)).toBe('2026-06-01');
    expect(
      usableDayOf('2026-06-01', [{ status: 'COMPLETED', completedAt: new Date('2026-05-20T03:00:00Z') }], day),
    ).toBe('2026-06-01');
  });
});
