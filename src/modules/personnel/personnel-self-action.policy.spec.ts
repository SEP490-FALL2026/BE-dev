import {
  operatorSubjectRefusal,
  personnelWriterRefusal,
  readAccessOf,
  technicalStepRefusal,
  userWriterRefusal,
} from './personnel-self-action.policy';
import type { PersonnelActor } from './public/personnel.types';

const principal = (roles: string[], employeeId = 'actor') => ({ roles, employeeId });
const user = (roles: string[], employeeId = 'actor'): PersonnelActor => ({
  kind: 'USER',
  principal: {
    subject: 's',
    appUserId: 'a',
    sessionId: 'x',
    employeeId,
    directRoles: roles,
    derivedRoles: [],
    roles,
  },
});
const operator: PersonnelActor = { kind: 'OPERATOR', ticketId: 't', ticketRef: 'CHG-1' };

describe('who writes an event of the personnel context', () => {
  it('lets the Super Admin write about another person', () => {
    expect(userWriterRefusal(principal(['SUPER_ADMIN']), 'someone-else')).toBeNull();
  });

  it.each([['IT_ADMIN'], ['MANAGER'], ['FINANCE'], ['EMPLOYEE']])('refuses %s: the role is not the writer', (role) => {
    expect(userWriterRefusal(principal([role]), 'someone-else')).toBe('FORBIDDEN');
  });

  it('refuses a caller with no role at all', () => {
    expect(userWriterRefusal(principal([]), 'someone-else')).toBe('FORBIDDEN');
  });

  it('refuses the Super Admin about themselves in the application', () => {
    expect(userWriterRefusal(principal(['SUPER_ADMIN'], 'me'), 'me')).toBe('SELF_CHANGE_FORBIDDEN');
  });

  it('judges the role before the person, so an IT Admin about themselves is forbidden and not "self"', () => {
    expect(userWriterRefusal(principal(['IT_ADMIN'], 'me'), 'me')).toBe('FORBIDDEN');
  });
});

describe('who the controlled procedure serves', () => {
  it('accepts the operator only for a person who holds the Super Admin role', () => {
    expect(operatorSubjectRefusal(true)).toBeNull();
    expect(operatorSubjectRefusal(false)).toBe('FORBIDDEN');
  });

  it('applies the rule that fits the kind of actor', () => {
    const facts = { subjectEmployeeId: 'subject' };
    expect(personnelWriterRefusal({ ...facts, actor: operator, subjectHoldsSuperAdmin: true })).toBeNull();
    expect(personnelWriterRefusal({ ...facts, actor: operator, subjectHoldsSuperAdmin: false })).toBe('FORBIDDEN');
    expect(
      personnelWriterRefusal({ ...facts, actor: user(['SUPER_ADMIN']), subjectHoldsSuperAdmin: false }),
    ).toBeNull();
    expect(
      personnelWriterRefusal({ ...facts, actor: user(['SUPER_ADMIN'], 'subject'), subjectHoldsSuperAdmin: true }),
    ).toBe('SELF_CHANGE_FORBIDDEN');
  });

  it('never lets a signed-in person use the roles of the subject to pass', () => {
    expect(
      personnelWriterRefusal({ actor: user(['IT_ADMIN']), subjectEmployeeId: 'subject', subjectHoldsSuperAdmin: true }),
    ).toBe('FORBIDDEN');
  });
});

describe('who takes the technical steps that follow an event', () => {
  it('is the IT Admin', () => {
    expect(technicalStepRefusal(principal(['IT_ADMIN']))).toBeNull();
    expect(technicalStepRefusal(principal(['SUPER_ADMIN']))).toBe('FORBIDDEN');
    expect(technicalStepRefusal(principal([]))).toBe('FORBIDDEN');
  });
});

describe('what a reader sees of the events', () => {
  it('gives the Super Admin everything, the IT Admin the minimal projection and nobody else anything', () => {
    expect(readAccessOf({ roles: ['SUPER_ADMIN'] })).toBe('FULL');
    expect(readAccessOf({ roles: ['IT_ADMIN'] })).toBe('MINIMAL');
    expect(readAccessOf({ roles: ['IT_ADMIN', 'SUPER_ADMIN'] })).toBe('FULL');
    expect(readAccessOf({ roles: ['MANAGER', 'FINANCE'] })).toBe('NONE');
    expect(readAccessOf({ roles: [] })).toBe('NONE');
  });
});
