import { acknowledgementStateOf, policyRolesOf, type PublishedVersionFacts } from './acknowledgement.policy';

const version = (versionNumber: number, requiresReacknowledgement: boolean): PublishedVersionFacts => ({
  versionNumber,
  requiresReacknowledgement,
});

describe('acknowledgementStateOf (R-34, T-PL)', () => {
  const applicable = ['MANAGER', 'IT_ADMIN'] as const;

  it('asks the first version of everyone it applies to, however it was published', () => {
    expect(
      acknowledgementStateOf({
        roles: ['MANAGER'],
        applicableRoles: applicable,
        versions: [version(1, false)],
        acknowledgedVersionNumbers: [],
      }),
    ).toBe('PENDING');
  });

  it('is done once a version at or above the latest one that asks again is acknowledged', () => {
    expect(
      acknowledgementStateOf({
        roles: ['MANAGER'],
        applicableRoles: applicable,
        versions: [version(1, true), version(2, false)],
        acknowledgedVersionNumbers: [1],
      }),
    ).toBe('DONE');
  });

  it('waits again when a later version asks for a new acknowledgement', () => {
    expect(
      acknowledgementStateOf({
        roles: ['MANAGER'],
        applicableRoles: applicable,
        versions: [version(1, true), version(2, false), version(3, true)],
        acknowledgedVersionNumbers: [1],
      }),
    ).toBe('PENDING');
  });

  it('is done by an acknowledgement of a version above the one that asked', () => {
    expect(
      acknowledgementStateOf({
        roles: ['IT_ADMIN'],
        applicableRoles: applicable,
        versions: [version(1, true), version(2, false), version(3, true)],
        acknowledgedVersionNumbers: [1, 3],
      }),
    ).toBe('DONE');
  });

  it('does not ask a person with none of the applicable roles', () => {
    expect(
      acknowledgementStateOf({
        roles: ['EMPLOYEE', 'FINANCE'],
        applicableRoles: applicable,
        versions: [version(1, true)],
        acknowledgedVersionNumbers: [],
      }),
    ).toBe('NOT_REQUIRED');
  });

  it('asks a person who holds any one of the applicable roles', () => {
    expect(
      acknowledgementStateOf({
        roles: ['IT_ADMIN'],
        applicableRoles: applicable,
        versions: [version(1, true)],
        acknowledgedVersionNumbers: [],
      }),
    ).toBe('PENDING');
  });

  it('does not ask when nothing has been published', () => {
    expect(
      acknowledgementStateOf({
        roles: ['MANAGER'],
        applicableRoles: applicable,
        versions: [],
        acknowledgedVersionNumbers: [],
      }),
    ).toBe('NOT_REQUIRED');
  });
});

describe('policyRolesOf', () => {
  it('keeps the roles of the library and drops what is not one', () => {
    expect(policyRolesOf(['MANAGER', 'ROOT', 'EMPLOYEE'])).toEqual(['EMPLOYEE', 'MANAGER']);
  });

  it('gives nothing for an account with no role', () => {
    expect(policyRolesOf([])).toEqual([]);
  });
});
