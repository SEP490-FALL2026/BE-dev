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
  accountLocked: false,
  closed: false,
  headsDepartment: false,
  ...extra,
});

const summaryOf = (extra: Partial<OffboardingSummaryRecord> = {}) =>
  toSummary(record(extra), new Map([[PERSON.id, PERSON]]), { today: '2026-11-13', heldRights: 0 });

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
});
