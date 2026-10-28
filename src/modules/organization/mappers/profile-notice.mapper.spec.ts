import { ProfileNoticeFacts, profileNoticesOf } from './profile-notice.mapper';

describe('profileNoticesOf (the in-app notices of a created or corrected employee record, F17, QĐ-87b(3), US-02-02 AC-17)', () => {
  const facts = (over: Partial<ProfileNoticeFacts>): ProfileNoticeFacts => ({
    kind: 'CREATED',
    organizationId: 'org-1',
    employee: { id: 'emp-1', working: true },
    departmentId: 'dep-1',
    headEmployeeId: 'head',
    itAdminEmployeeId: 'it',
    eventId: 'evt-1',
    ...over,
  });

  it('tells the head and the IT Admin in charge of a new record, not the person it is about', () => {
    const notices = profileNoticesOf(facts({ kind: 'CREATED' }));

    expect(notices.map((notice) => notice.recipientEmployeeId)).toEqual(['head', 'it']);
    expect(new Set(notices.map((notice) => notice.code))).toEqual(new Set(['EMPLOYEE_PROFILE_CREATED']));
  });

  it('tells the person, while they work, and their head of a corrected record, not the IT Admin', () => {
    const notices = profileNoticesOf(facts({ kind: 'UPDATED' }));

    expect(notices.map((notice) => notice.recipientEmployeeId)).toEqual(['emp-1', 'head']);
    expect(new Set(notices.map((notice) => notice.code))).toEqual(new Set(['EMPLOYEE_PROFILE_UPDATED']));
  });

  it('does not tell a person who no longer works of a correction to the record', () => {
    const notices = profileNoticesOf(facts({ kind: 'UPDATED', employee: { id: 'emp-1', working: false } }));

    expect(notices.map((notice) => notice.recipientEmployeeId)).toEqual(['head']);
  });

  it('tells nobody twice: a head who is also the IT Admin, or the person who heads their own department', () => {
    expect(
      profileNoticesOf(facts({ kind: 'CREATED', headEmployeeId: 'both', itAdminEmployeeId: 'both' })).map(
        (notice) => notice.recipientEmployeeId,
      ),
    ).toEqual(['both']);
    expect(
      profileNoticesOf(facts({ kind: 'UPDATED', headEmployeeId: 'emp-1' })).map((notice) => notice.recipientEmployeeId),
    ).toEqual(['emp-1']);
  });

  it('tells nobody in a role nobody holds, and nobody at all of a department with neither', () => {
    expect(
      profileNoticesOf(facts({ kind: 'CREATED', headEmployeeId: null })).map((notice) => notice.recipientEmployeeId),
    ).toEqual(['it']);
    expect(profileNoticesOf(facts({ kind: 'CREATED', headEmployeeId: null, itAdminEmployeeId: null }))).toEqual([]);
    expect(
      profileNoticesOf(facts({ kind: 'UPDATED', employee: { id: 'emp-1', working: false }, headEmployeeId: null })),
    ).toEqual([]);
  });

  it('carries ids only, about the employee, and a key that tells one event from another', () => {
    const [notice] = profileNoticesOf(facts({ kind: 'CREATED', headEmployeeId: 'head', itAdminEmployeeId: null }));

    expect(notice).toEqual({
      organizationId: 'org-1',
      recipientEmployeeId: 'head',
      code: 'EMPLOYEE_PROFILE_CREATED',
      subject: { type: 'EMPLOYEE', id: 'emp-1' },
      params: { employeeId: 'emp-1', departmentId: 'dep-1' },
      eventKey: 'employee_profile_created:emp-1:evt-1',
    });
    expect(profileNoticesOf(facts({ kind: 'CREATED', eventId: 'evt-2' }))[0].eventKey).not.toBe(notice.eventKey);
  });

  it('names no department for a person who is in none that day', () => {
    const [notice] = profileNoticesOf(facts({ kind: 'UPDATED', departmentId: null }));

    expect(notice.params).toEqual({ employeeId: 'emp-1', departmentId: null });
  });
});
