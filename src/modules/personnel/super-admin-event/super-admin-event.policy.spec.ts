import { SuperAdminEventRefusedError } from '../public/super-admin-event.errors';
import { assertContext, assertSplit, noticeKindFitsMode, parametersDigest } from './super-admin-event.policy';
import type { SuperAdminEventContext, SuperAdminEventParameters } from '../public/super-admin-event.types';

const BASIS = { type: 'DECISION', reference: 'QD-31/2026', issuer: 'Board of Directors', issuedOn: '2026-10-20' };
const context = (patch: Partial<SuperAdminEventContext> = {}): SuperAdminEventContext => ({
  ticketRef: 'R-2026-031',
  approvedBy: 'cto-office',
  operator: 'ops-2',
  environment: 'SHARED',
  subjectCode: 'E-SA',
  basis: BASIS,
  ...patch,
});
const problem = (work: () => void): string | null => {
  try {
    work();
  } catch (error) {
    if (error instanceof SuperAdminEventRefusedError) return error.problem;
    throw error;
  }

  return null;
};

describe('what the controlled procedure judges before it opens a transaction (spec L.2)', () => {
  it('lets a whole context through', () => {
    expect(problem(() => assertContext(context()))).toBeNull();
  });

  it.each([
    ['a ticket that is too short', { ticketRef: 'R1' }, 'TICKET_REFERENCE_INVALID'],
    ['a ticket with a space', { ticketRef: 'R 2026 031' }, 'TICKET_REFERENCE_INVALID'],
    ['an approver that is not a reference', { approvedBy: 'x' }, 'TICKET_REFERENCE_INVALID'],
    ['an operator with a control character', { operator: 'ops\u0007' }, 'TICKET_REFERENCE_INVALID'],
    ['a basis without its issuer', { basis: { ...BASIS, issuer: '' } }, 'BASIS_INVALID'],
    ['a basis whose day is not a date', { basis: { ...BASIS, issuedOn: 'soon' } }, 'BASIS_INVALID'],
    ['one person who approves and runs it in SHARED', { operator: ' CTO-Office ' }, 'APPROVER_IS_OPERATOR'],
  ])('refuses %s', (_name, patch, expected) => {
    expect(problem(() => assertContext(context(patch as Partial<SuperAdminEventContext>)))).toBe(expected);
  });

  it('lets one person approve and run it in LOCAL_TEST, which the Audit Trail records', () => {
    expect(problem(() => assertContext(context({ environment: 'LOCAL_TEST', operator: 'cto-office' })))).toBeNull();
  });

  it('leaves the code of a notice as a basis to the event, which refuses it with its own code', () => {
    expect(problem(() => assertContext(context({ basis: { ...BASIS, reference: 'BM09-2026-000001' } })))).toBeNull();
  });
});

describe('the split of persons, in every environment', () => {
  const subject = { employeeCode: 'E-SA', loginEmail: 'Admin@Acme.vn', workEmail: 'super.admin@acme.vn' };

  it.each([
    ['the operator is the subject by employee code', { operator: 'e-sa' }, 'OPERATOR_IS_SUBJECT'],
    [
      'the operator is the subject by login email, whatever the case and spaces',
      { operator: ' admin @acme.vn ' },
      'OPERATOR_IS_SUBJECT',
    ],
    ['the operator is the subject by work email', { operator: 'SUPER.ADMIN@acme.vn' }, 'OPERATOR_IS_SUBJECT'],
    ['the approver is the subject by employee code', { approvedBy: 'E-SA' }, 'APPROVER_IS_SUBJECT'],
    ['the approver is the subject by login email', { approvedBy: 'admin@acme.vn' }, 'APPROVER_IS_SUBJECT'],
  ])('refuses when %s', (_name, patch, expected) => {
    for (const environment of ['LOCAL_TEST', 'SHARED'] as const) {
      expect(problem(() => assertSplit(context({ environment, ...(patch as object) }), subject))).toBe(expected);
    }
  });

  it('lets two other people through, and a subject that has no account', () => {
    expect(problem(() => assertSplit(context(), subject))).toBeNull();
    expect(
      problem(() => assertSplit(context(), { employeeCode: 'E-SA', loginEmail: null, workEmail: null })),
    ).toBeNull();
  });
});

describe('the notice a recording mode may come from', () => {
  it('is of the kind the mode records, and of no other', () => {
    expect(noticeKindFitsMode('transfer-record', 'DEPARTMENT_TRANSFER_OUT')).toBe(true);
    expect(noticeKindFitsMode('transfer-record', 'DEPARTMENT_TRANSFER_IN')).toBe(true);
    expect(noticeKindFitsMode('leave-start', 'LONG_LEAVE')).toBe(true);
    expect(noticeKindFitsMode('departure-record', 'DEPARTURE')).toBe(true);
    expect(noticeKindFitsMode('abrupt-departure-record', 'ABRUPT_DEPARTURE')).toBe(true);
    expect(noticeKindFitsMode('departure-record', 'ABRUPT_DEPARTURE')).toBe(false);
    expect(noticeKindFitsMode('transfer-record', 'JOB_TITLE_CHANGE')).toBe(false);
    expect(noticeKindFitsMode('transfer-cancel', 'DEPARTMENT_TRANSFER_OUT')).toBe(false);
  });
});

describe('the digest of the parameters of a ticket', () => {
  const parameters: SuperAdminEventParameters = {
    mode: 'transfer-record',
    toDepartmentId: '0191a3b4-0000-7000-8000-000000000001',
    effectiveOn: '2026-11-03',
  };
  const digest = (patch: Partial<SuperAdminEventContext> = {}, params: SuperAdminEventParameters = parameters) =>
    parametersDigest({ subjectCode: 'E-SA', basis: BASIS, ...patch }, params);

  it('is a SHA-256 in hex and the same for the same parameters, whatever the order they were written in', () => {
    const reordered = {
      effectiveOn: '2026-11-03',
      toDepartmentId: parameters.mode === 'transfer-record' ? parameters.toDepartmentId : '',
      mode: 'transfer-record' as const,
    };

    expect(digest()).toMatch(/^[0-9a-f]{64}$/);
    expect(digest()).toBe(digest({}, reordered));
  });

  it('does not depend on who approved or ran it, nor on the case of the subject code', () => {
    expect(digest({ subjectCode: 'e-sa' })).toBe(digest());
  });

  it.each([
    ['a day', { ...parameters, effectiveOn: '2026-11-04' }, {}],
    ['a department', { ...parameters, toDepartmentId: '0191a3b4-0000-7000-8000-000000000002' }, {}],
    [
      'a mode',
      {
        mode: 'transfer-cancel' as const,
        transferId: parameters.mode === 'transfer-record' ? parameters.toDepartmentId : '',
        reason: 'x',
      },
      {},
    ],
    ['the basis', parameters, { basis: { ...BASIS, reference: 'QD-32/2026' } }],
    ['the person', parameters, { subjectCode: 'E-OTHER' }],
  ])('changes with %s', (_name, params, patch) => {
    expect(digest(patch as Partial<SuperAdminEventContext>, params as SuperAdminEventParameters)).not.toBe(digest());
  });
});
