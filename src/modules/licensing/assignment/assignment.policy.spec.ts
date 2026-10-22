import {
  AssignmentEffectiveDateInvalidError,
  AssignmentExpectedEndRequiredError,
  AssignmentNotOpenError,
  AssignmentNotServiceAccountError,
  AssignmentResponsibleInvalidError,
} from '../licensing.errors';
import type { AssignmentRecord } from '../licensing.types';
import { assertResponsibleChange, effectiveFromLabel, toAssignmentView } from './assignment.policy';

const bot: AssignmentRecord = {
  id: 'a1',
  source: 'BASELINE',
  kind: 'SERVICE',
  planId: 'p1',
  subscriptionId: 's1',
  employeeId: 'e2',
  accountIdentifier: 'ci-bot',
  reason: 'CI pipeline',
  costCenterId: 'cc-corp',
  effectiveFrom: '2026-10-01',
  effectiveFromBasis: 'ACTUAL',
  validUntil: null,
  expectedEndDate: null,
  predecessorId: null,
  failedAt: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
};
const staff = { status: 'ACTIVE', employmentType: 'STAFF' } as const;

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

describe('assertResponsibleChange (AC-10)', () => {
  const change = { employeeId: 'e5', effectiveFrom: '2026-10-15', expectedEndDate: null };
  const today = '2026-10-10';

  it('lets an open service account pass to an active person from a day after it began and not in the past', () => {
    expect(() => assertResponsibleChange(bot, change, staff, today)).not.toThrow();
    expect(() => assertResponsibleChange(bot, { ...change, effectiveFrom: today }, staff, today)).not.toThrow();
  });

  it('refuses a personal seat', () => {
    expect(() => assertResponsibleChange({ ...bot, kind: 'PERSONAL' }, change, staff, today)).toThrow(
      AssignmentNotServiceAccountError,
    );
  });

  it('refuses an assignment that has ended or is set to end', () => {
    expect(() => assertResponsibleChange({ ...bot, validUntil: '2026-12-01' }, change, staff, today)).toThrow(
      AssignmentNotOpenError,
    );
  });

  it('refuses a day that is not after the one the service account began, and a day in the past', () => {
    expect(() => assertResponsibleChange(bot, { ...change, effectiveFrom: '2026-10-01' }, staff, '2026-09-01')).toThrow(
      AssignmentEffectiveDateInvalidError,
    );
    expect(() => assertResponsibleChange(bot, { ...change, effectiveFrom: '2026-10-09' }, staff, today)).toThrow(
      AssignmentEffectiveDateInvalidError,
    );
  });

  it('refuses a person that is not found, one who has left, and the person already responsible', () => {
    expect(() => assertResponsibleChange(bot, change, null, today)).toThrow(AssignmentResponsibleInvalidError);
    expect(() =>
      assertResponsibleChange(bot, change, { status: 'TERMINATED', employmentType: 'STAFF' }, today),
    ).toThrow(AssignmentResponsibleInvalidError);
    expect(() => assertResponsibleChange(bot, { ...change, employeeId: 'e2' }, staff, today)).toThrow(
      AssignmentResponsibleInvalidError,
    );
  });

  it('asks time-limited staff for an expected end date no earlier than the day the change takes effect (INV-07)', () => {
    const intern = { status: 'ACTIVE', employmentType: 'INTERN' } as const;

    expect(() => assertResponsibleChange(bot, change, intern, today)).toThrow(AssignmentExpectedEndRequiredError);
    expect(() => assertResponsibleChange(bot, { ...change, expectedEndDate: '2026-10-14' }, intern, today)).toThrow(
      AssignmentEffectiveDateInvalidError,
    );
    expect(() =>
      assertResponsibleChange(bot, { ...change, expectedEndDate: '2027-03-31' }, intern, today),
    ).not.toThrow();
  });

  it('checks in order: the kind, then whether it is open, then the date, then the person', () => {
    const closedPersonal = { ...bot, kind: 'PERSONAL', validUntil: '2026-12-01' } as const;

    expect(() => assertResponsibleChange(closedPersonal, change, null, today)).toThrow(
      AssignmentNotServiceAccountError,
    );
    expect(() =>
      assertResponsibleChange(
        { ...bot, validUntil: '2026-12-01' },
        { ...change, effectiveFrom: '2026-10-01' },
        null,
        today,
      ),
    ).toThrow(AssignmentNotOpenError);
    expect(() => assertResponsibleChange(bot, { ...change, effectiveFrom: '2026-10-01' }, null, '2026-09-01')).toThrow(
      AssignmentEffectiveDateInvalidError,
    );
  });
});
