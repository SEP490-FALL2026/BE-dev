import {
  ApplicationResponsibilityForbiddenError,
  ApplicationResponsibleNotItAdminError,
} from './application-responsibility.errors';
import { decideResponsibilityTransfer } from './application-responsibility.policy';

const it1 = { role: 'IT_ADMIN' as const, employeeId: 'it-1' };
const it2 = { role: 'IT_ADMIN' as const, employeeId: 'it-2' };
const superAdmin = { role: 'SUPER_ADMIN' as const, employeeId: 'sa-1' };

const decide = (over: Partial<Parameters<typeof decideResponsibilityTransfer>[0]> = {}) =>
  decideResponsibilityTransfer({
    actor: it1,
    responsibleEmployeeId: 'it-1',
    needsResponsible: false,
    toEmployeeId: 'it-2',
    toIsUsableItAdmin: true,
    ...over,
  });

describe('who may hand an application to whom (QĐ-111g, R-26, US-04-06 AC-7, AC-8)', () => {
  it('lets the responsible IT Admin hand it to another working IT Admin', () => {
    expect(decide()).toBe('CHANGE');
  });

  it('refuses another IT Admin while the application still has a responsible IT Admin who works (403)', () => {
    expect(() => decide({ actor: it2, toEmployeeId: 'it-2' })).toThrow(ApplicationResponsibilityForbiddenError);
    expect(() => decide({ actor: it2, toEmployeeId: 'it-3' })).toThrow(ApplicationResponsibilityForbiddenError);
  });

  it('lets any IT Admin take an application that needs one, for themselves only', () => {
    expect(decide({ actor: it2, responsibleEmployeeId: null, needsResponsible: true, toEmployeeId: 'it-2' })).toBe(
      'CHANGE',
    );
    expect(decide({ actor: it2, responsibleEmployeeId: 'gone', needsResponsible: true, toEmployeeId: 'it-2' })).toBe(
      'CHANGE',
    );
    expect(() =>
      decide({ actor: it2, responsibleEmployeeId: null, needsResponsible: true, toEmployeeId: 'it-3' }),
    ).toThrow(ApplicationResponsibilityForbiddenError);
  });

  it('lets the Super Admin name any working IT Admin, whoever is responsible', () => {
    expect(decide({ actor: superAdmin, toEmployeeId: 'it-3' })).toBe('CHANGE');
    expect(
      decide({ actor: superAdmin, responsibleEmployeeId: null, needsResponsible: true, toEmployeeId: 'it-3' }),
    ).toBe('CHANGE');
  });

  it('refuses a person who is not a working IT Admin (422), after the authority is judged', () => {
    expect(() => decide({ toIsUsableItAdmin: false })).toThrow(ApplicationResponsibleNotItAdminError);
    expect(() => decide({ actor: it2, toIsUsableItAdmin: false })).toThrow(ApplicationResponsibilityForbiddenError);
  });

  it('changes nothing when the application is handed to the one already responsible and working', () => {
    expect(decide({ toEmployeeId: 'it-1' })).toBe('UNCHANGED');
    expect(decide({ actor: superAdmin, toEmployeeId: 'it-1' })).toBe('UNCHANGED');
  });

  it('a responsible person who no longer works does not count as responsible: handing to them changes it (and is refused as not working)', () => {
    expect(() =>
      decide({
        actor: superAdmin,
        responsibleEmployeeId: 'gone',
        needsResponsible: true,
        toEmployeeId: 'gone',
        toIsUsableItAdmin: false,
      }),
    ).toThrow(ApplicationResponsibleNotItAdminError);
  });
});
