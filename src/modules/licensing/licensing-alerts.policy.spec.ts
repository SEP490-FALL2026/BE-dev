import {
  expiryReminderAlert,
  handoverAlert,
  leaverAccessAlert,
  leaverKeepsAccess,
  recipientsOf,
  serviceAccountDueAlert,
  serviceAccountOverdueAlert,
  usableOrNull,
  type LicensingAlert,
} from './licensing-alerts.policy';

const A = '00000000-0000-4000-8000-00000000000a';
const E = '00000000-0000-4000-8000-00000000000e';
const P = '00000000-0000-4000-8000-00000000000b';
const D = '00000000-0000-4000-8000-00000000000d';
const T = '00000000-0000-4000-8000-00000000000c';
const F = '00000000-0000-4000-8000-00000000000f';

const duty = (dueOn = '2026-09-29') => ({
  id: D,
  assignmentId: A,
  employeeId: E,
  confirmerRole: 'DEPARTMENT_HEAD',
  dueOn,
});

describe('who an alert of a right goes to (US-12-15)', () => {
  it('tells each person once and nobody in the place of a role nobody holds', () => {
    expect(recipientsOf([E, null, undefined, E, P, ''])).toEqual([E, P]);
    expect(recipientsOf([null, null])).toEqual([]);
  });

  it('keeps an IT Admin only while they can act as one: a role that was taken away is told nothing', () => {
    expect(usableOrNull(E, new Set([E]))).toBe(E);
    expect(usableOrNull(E, new Set([P]))).toBeNull();
    expect(usableOrNull(null, new Set([E]))).toBeNull();
  });
});

describe('what each alert says and its key (FR-5.14 lines 3, 12, 13, 38)', () => {
  it('reminds of a right that ends once for the right and the end date, whatever the audience (line 3)', () => {
    const holder = expiryReminderAlert({
      assignmentId: A,
      holderEmployeeId: E,
      planId: P,
      expectedEndDate: '2026-09-30',
      audience: 'EMPLOYEE',
    });
    const head = expiryReminderAlert({
      assignmentId: A,
      holderEmployeeId: E,
      planId: P,
      expectedEndDate: '2026-09-30',
      audience: 'HEAD',
    });

    expect(holder).toEqual({
      code: 'LICENSE_EXPIRY_REMINDER',
      subject: { type: 'LicenseAssignment', id: A },
      params: { assignmentId: A, holderEmployeeId: E, planId: P, expectedEndDate: '2026-09-30', audience: 'EMPLOYEE' },
      eventKey: `LICENSE_EXPIRY_REMINDER:${A}:2026-09-30`,
    });
    // A person who is both the holder and the IT Admin in charge is told once: the key does not name the audience.
    expect(head.eventKey).toBe(holder.eventKey);
    // A right renewed to a new end date is a new fact.
    expect(
      expiryReminderAlert({ ...holder.params, expectedEndDate: '2026-12-31', audience: 'EMPLOYEE' } as never).eventKey,
    ).not.toBe(holder.eventKey);
  });

  it('tells a handover that waits once for the duty, and its overdue once for each deadline (line 12)', () => {
    const due = handoverAlert('DUE', duty());
    const overdue = handoverAlert('OVERDUE', duty());

    expect(due).toMatchObject({
      code: 'HANDOVER_CONFIRMATION_DUE',
      subject: { type: 'HandoverDuty', id: D },
      params: { dutyId: D, assignmentId: A, employeeId: E, role: 'DEPARTMENT_HEAD', dueOn: '2026-09-29' },
      eventKey: `HANDOVER_CONFIRMATION_DUE:${D}`,
    });
    expect(handoverAlert('DUE', duty('2026-10-05')).eventKey).toBe(due.eventKey);
    expect(overdue.code).toBe('HANDOVER_CONFIRMATION_OVERDUE');
    expect(overdue.eventKey).toBe(`HANDOVER_CONFIRMATION_OVERDUE:${D}:2026-09-29`);
    expect(handoverAlert('OVERDUE', duty('2026-10-05')).eventKey).not.toBe(overdue.eventKey);
  });

  it('reminds of a service account before the day once for the file and day, and alerts after it once for the account and day (line 13)', () => {
    const file = { employeeId: E, fileKind: 'TRANSFER', fileId: F, dueOn: '2026-07-01' };
    const due = serviceAccountDueAlert(file, 2);
    const overdue = serviceAccountOverdueAlert({ assignmentId: A, owningDepartmentId: D, ...file });

    expect(due).toEqual({
      code: 'SERVICE_ACCOUNT_RESPONSIBLE_DUE',
      subject: { type: 'Employee', id: E },
      params: { ...file, accountCount: 2 },
      eventKey: `SERVICE_ACCOUNT_RESPONSIBLE_DUE:${F}:2026-07-01`,
    });
    expect(serviceAccountDueAlert({ ...file, dueOn: '2026-07-15' }, 2).eventKey).not.toBe(due.eventKey);
    // The row of a duty also carries the identifier of the account and its plan: neither reaches the notice.
    const fromRow = serviceAccountOverdueAlert({
      assignmentId: A,
      owningDepartmentId: D,
      ...file,
      accountIdentifier: 'ci-bot@acme.vn',
      planId: P,
    } as Parameters<typeof serviceAccountOverdueAlert>[0]);
    expect(Object.keys(fromRow.params).sort()).toEqual(
      ['assignmentId', 'dueOn', 'employeeId', 'fileId', 'fileKind', 'owningDepartmentId'].sort(),
    );
    expect(overdue).toMatchObject({
      code: 'SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE',
      subject: { type: 'LicenseAssignment', id: A },
      eventKey: `SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE:${A}:2026-07-01`,
    });
  });

  it('tells a K1 access that runs on for a person who leaves, and nothing for any other completion (line 38, QĐ-77l)', () => {
    expect(leaverKeepsAccess({ accessState: 'UNTIL_PAID_END', sources: ['DEPARTURE'] })).toBe(true);
    expect(leaverKeepsAccess({ accessState: 'UNTIL_PAID_END', sources: ['RETURN', 'ABRUPT_DEPARTURE'] })).toBe(true);
    expect(leaverKeepsAccess({ accessState: 'UNTIL_PAID_END', sources: ['TIME_LIMITED_EXPIRY'] })).toBe(false);
    expect(leaverKeepsAccess({ accessState: 'CUT', sources: ['DEPARTURE'] })).toBe(false);
    expect(leaverKeepsAccess({ accessState: null, sources: ['DEPARTURE'] })).toBe(false);
    expect(
      leaverAccessAlert({ taskId: T, assignmentId: A, employeeId: E, planId: P, accessUntil: '2026-11-30' }),
    ).toEqual({
      code: 'LEAVER_K1_ACCESS_RUNS_ON',
      subject: { type: 'ProvisioningTask', id: T },
      params: { taskId: T, assignmentId: A, employeeId: E, planId: P, accessUntil: '2026-11-30' },
      eventKey: `LEAVER_K1_ACCESS_RUNS_ON:${T}`,
    });
  });

  it('carries only flat ids, codes, days and counts, never a name, an identifier of an account or a note', () => {
    const file = { employeeId: E, fileKind: 'OFFBOARDING', fileId: F, dueOn: '2026-09-30' };
    const alerts: LicensingAlert[] = [
      expiryReminderAlert({
        assignmentId: A,
        holderEmployeeId: E,
        planId: P,
        expectedEndDate: '2026-09-30',
        audience: 'IT_ADMIN',
      }),
      handoverAlert('DUE', duty()),
      handoverAlert('OVERDUE', duty()),
      serviceAccountDueAlert(file, 1),
      serviceAccountOverdueAlert({ assignmentId: A, owningDepartmentId: null, ...file }),
      leaverAccessAlert({ taskId: T, assignmentId: A, employeeId: E, planId: P, accessUntil: '2026-11-30' }),
    ];

    for (const alert of alerts) {
      for (const [key, value] of Object.entries(alert.params)) {
        expect(key).not.toMatch(/name|email|identifier|note|text|evidence/i);
        expect(value === null || ['string', 'number'].includes(typeof value)).toBe(true);
      }
      expect(alert.eventKey.length).toBeLessThanOrEqual(200);
    }
  });
});
