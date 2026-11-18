import type { EmployeeRecord } from '../../../organization/public/organization.types';
import { ROLE_FLAGS } from '../../public/personnel.types';
import { offboardingSummarySchema } from '../offboarding.dto';
import { toSummary } from '../offboarding.mapper';
import type { OffboardingSummaryRecord } from '../offboarding.types';

const PERSON: EmployeeRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  employeeCode: 'NV-001',
  fullName: 'Nguyễn Văn A',
  workEmail: null,
  employmentType: 'STAFF',
  status: 'ACTIVE',
  workState: 'HANDING_OVER',
  hireDate: '2024-01-02',
};

const record = (extra: Partial<OffboardingSummaryRecord> = {}): OffboardingSummaryRecord => ({
  id: '33333333-3333-4333-8333-333333333333',
  employeeId: PERSON.id,
  state: 'HANDING_OVER',
  accessBlockMode: 'WITH_LAST_DAY',
  lastWorkingDay: '2026-11-20',
  leftOn: null,
  revocationDueOn: null,
  accountLocked: false,
  closed: false,
  headsDepartment: false,
  ...extra,
});

const summaryOf = (
  extra: Partial<OffboardingSummaryRecord> = {},
  facts: { today?: string; rightsWithoutCompletedTask?: number } = {},
) =>
  toSummary(record(extra), new Map([[PERSON.id, PERSON]]), {
    today: facts.today ?? '2026-11-13',
    heldRights: 0,
    rightsWithoutCompletedTask: facts.rightsWithoutCompletedTask ?? 0,
  });

describe('the summary of an offboarding case on the wire (QĐ-110, SPEC P3)', () => {
  it.each(['WITH_LAST_DAY', 'BLOCK_NOW'] as const)(
    'tells the way the access is blocked by accessBlockMode and by nothing else (%s): the flag abrupt is gone',
    (accessBlockMode) => {
      const wire = summaryOf({ accessBlockMode });

      expect(wire.accessBlockMode).toBe(accessBlockMode);
      expect(wire).not.toHaveProperty('abrupt');
      expect(Object.keys(offboardingSummarySchema.shape)).not.toContain('abrupt');
    },
  );

  it('names exactly the roles that need someone to take over, with no approver standing in for another', () => {
    const wire = summaryOf();

    expect(Object.keys(wire.roleFlags)).toEqual([...ROLE_FLAGS]);
    expect(wire.roleFlags).not.toHaveProperty('SUBSTITUTE_APPROVER');
    expect(wire.roleFlags).not.toHaveProperty('FALLBACK_APPROVER');
  });

  describe('the deadline of the revocations on the case (QĐ-110c, SPEC P3)', () => {
    it('tells the day, the rights left without a completed task, and that the case is late once today is past the day with one left', () => {
      const late = summaryOf({ revocationDueOn: '2026-11-12' }, { rightsWithoutCompletedTask: 2 });

      expect(late.revocation).toEqual({ dueOn: '2026-11-12', overdue: true, rightsWithoutCompletedTask: 2 });
    });

    it.each([
      ['on the day itself', { revocationDueOn: '2026-11-13' }, 2],
      ['when every right has a completed task', { revocationDueOn: '2026-11-12' }, 0],
      ['for a case with no deadline', { revocationDueOn: null }, 2],
      ['for a cancelled case', { revocationDueOn: '2026-11-12', state: 'CANCELLED' as const }, 0],
      ['for a closed case', { revocationDueOn: '2026-11-12', state: 'LEFT' as const, closed: true }, 0],
    ])('is not late %s', (_name, extra, rights) => {
      expect(summaryOf(extra, { rightsWithoutCompletedTask: rights }).revocation.overdue).toBe(false);
    });

    it('keeps the key in the schema of the wire', () => {
      expect(Object.keys(offboardingSummarySchema.shape)).toContain('revocation');
    });
  });
});
