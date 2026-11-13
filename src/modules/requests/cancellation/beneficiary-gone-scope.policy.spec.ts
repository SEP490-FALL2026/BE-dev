import type { AccessRequestState } from '../access-request/access-request.types';
import { LINE_STATES, type LineState } from '../access-request/group-request.types';
import { goneCauseOf, verdictOf, type GoneScope } from './beneficiary-gone-scope.policy';

const OLD = '00000000-0000-4000-8000-0000000000a1';
const NEW = '00000000-0000-4000-8000-0000000000b2';
const ALL: GoneScope = { kind: 'ALL_OPEN' };
const OLD_DEPARTMENT: GoneScope = { kind: 'PAID_OLD_DEPARTMENT', oldDepartmentId: OLD };

const paid = (state: AccessRequestState, departmentId = OLD) =>
  ({ type: 'GRANT', branch: 'PAID_IN_CATALOG', departmentId, state }) as const;
const free = (state: AccessRequestState, departmentId = OLD) =>
  ({ type: 'GRANT', branch: 'INTERNAL_FREE', departmentId, state }) as const;
const proposal = (state: AccessRequestState) =>
  ({ type: 'GRANT', branch: 'NEW_SOFTWARE', departmentId: OLD, state }) as const;
const group = (departmentId = OLD) =>
  ({ type: 'GROUP_GRANT', branch: 'PAID_IN_CATALOG', departmentId, state: 'AWAITING_EXECUTION' }) as const;

/** QĐ-110d, QĐ-110o: which of a gone person's requests the system closes, and which it leaves to the IT Admin. */
describe('what the system does to the request of a person who is gone', () => {
  describe('every open request of a person who left (ALL_OPEN, QĐ-110d, M-12)', () => {
    it.each<AccessRequestState>([
      'PENDING',
      'WAITING_CONTROLLED',
      'AWAITING_IT_ASSESSMENT',
      'AWAITING_SPEND_SUBMISSION',
      'AWAITING_SPEND_DECISION',
      'AWAITING_REQUESTER_REVISION',
      'AWAITING_EXECUTION',
    ])('cancels a paid request that has no grant task yet (%s)', (state) => {
      expect(verdictOf(ALL, paid(state), null)).toBe('CANCEL');
    });

    it('does not cancel a request whose grant is being carried out: the IT Admin checks the vendor and closes it', () => {
      expect(verdictOf(ALL, paid('EXECUTING'), null)).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(ALL, free('EXECUTING'), null)).toBe('NEEDS_IT_CHECK');
    });

    it('does not cancel an approved request to go on using: the task that extends the right was opened at approval, so it has one while it waits', () => {
      const renewal = { ...paid('AWAITING_EXECUTION'), type: 'RENEWAL' } as const;

      expect(verdictOf(ALL, renewal, null)).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(ALL, { ...renewal, branch: 'INTERNAL_FREE' }, null)).toBe('NEEDS_IT_CHECK');
    });

    it('cancels what is free (K5), a proposal of new software (case B) and a request to go on using, whatever the department', () => {
      expect(verdictOf(ALL, free('AWAITING_EXECUTION'), null)).toBe('CANCEL');
      expect(verdictOf(ALL, free('PENDING', NEW), null)).toBe('CANCEL');
      expect(verdictOf(ALL, proposal('AWAITING_IT_ASSESSMENT'), null)).toBe('CANCEL');
      expect(verdictOf(ALL, { ...paid('AWAITING_SPEND_DECISION'), type: 'RENEWAL' }, null)).toBe('CANCEL');
    });

    it.each<AccessRequestState>(['REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED', 'DRAFT'])(
      'leaves a request that is over or is a draft (%s)',
      (state) => {
        expect(verdictOf(ALL, paid(state), null)).toBe('SKIP');
      },
    );

    it('asks the IT Admin to check a request withdrawn while its grant had failed: its task waits for them to close it (SPEC §8: nothing waits)', () => {
      expect(verdictOf(ALL, paid('AWAITING_IT_CLOSE'), null)).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(ALL, free('AWAITING_IT_CLOSE'), null)).toBe('NEEDS_IT_CHECK');
    });
  });

  describe('the paid requests of the department the person was moved from (PAID_OLD_DEPARTMENT, QĐ-110o)', () => {
    it('cancels a paid request sent from the old department that has no grant task yet', () => {
      expect(verdictOf(OLD_DEPARTMENT, paid('PENDING'), null)).toBe('CANCEL');
      expect(verdictOf(OLD_DEPARTMENT, paid('AWAITING_EXECUTION'), null)).toBe('CANCEL');
      expect(verdictOf(OLD_DEPARTMENT, { ...paid('AWAITING_SPEND_DECISION'), type: 'RENEWAL' }, null)).toBe('CANCEL');
    });

    it('asks the IT Admin to check the vendor when the grant is being carried out, or the extension of a renewal waits for them', () => {
      expect(verdictOf(OLD_DEPARTMENT, paid('EXECUTING'), null)).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(OLD_DEPARTMENT, { ...paid('AWAITING_EXECUTION'), type: 'RENEWAL' }, null)).toBe(
        'NEEDS_IT_CHECK',
      );
    });

    it('leaves a request of the new department, a free one (K5) and a proposal of new software not priced yet', () => {
      expect(verdictOf(OLD_DEPARTMENT, paid('PENDING', NEW), null)).toBe('SKIP');
      expect(verdictOf(OLD_DEPARTMENT, free('AWAITING_EXECUTION'), null)).toBe('SKIP');
      expect(verdictOf(OLD_DEPARTMENT, proposal('PENDING'), null)).toBe('SKIP');
      expect(verdictOf(OLD_DEPARTMENT, proposal('WAITING_CONTROLLED'), null)).toBe('SKIP');
      expect(verdictOf(OLD_DEPARTMENT, proposal('AWAITING_IT_ASSESSMENT'), null)).toBe('SKIP');
    });

    it('cancels a proposal of new software (case B) the IT Admin priced with a payment: it is a paid request of the old department (QĐ-110o, BR-MF3-03)', () => {
      expect(verdictOf(OLD_DEPARTMENT, proposal('AWAITING_SPEND_SUBMISSION'), null)).toBe('CANCEL');
      expect(verdictOf(OLD_DEPARTMENT, proposal('AWAITING_SPEND_DECISION'), null)).toBe('CANCEL');
      expect(verdictOf(OLD_DEPARTMENT, proposal('AWAITING_EXECUTION'), null)).toBe('CANCEL');
      expect(verdictOf(OLD_DEPARTMENT, proposal('EXECUTING'), null)).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(OLD_DEPARTMENT, proposal('AWAITING_IT_CLOSE'), null)).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(OLD_DEPARTMENT, { ...proposal('AWAITING_SPEND_DECISION'), departmentId: NEW }, null)).toBe(
        'SKIP',
      );
    });

    it('leaves the request of a service account: it follows the department that owns it, not the person', () => {
      expect(verdictOf(OLD_DEPARTMENT, { ...paid('PENDING'), type: 'SERVICE_ACCOUNT' }, null)).toBe('SKIP');
    });

    it('leaves a request that is over, and asks the IT Admin to close a withdrawal that waits for them', () => {
      expect(verdictOf(OLD_DEPARTMENT, paid('COMPLETED'), null)).toBe('SKIP');
      expect(verdictOf(OLD_DEPARTMENT, paid('AWAITING_IT_CLOSE'), null)).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(OLD_DEPARTMENT, paid('AWAITING_IT_CLOSE', NEW), null)).toBe('SKIP');
    });
  });

  describe('the line of the person in a request for a group (M-12)', () => {
    it.each<LineState>(['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED'])(
      'cancels the line of the person that has no grant task yet (%s)',
      (line) => {
        expect(verdictOf(ALL, group(), line)).toBe('CANCEL');
        expect(verdictOf(OLD_DEPARTMENT, group(), line)).toBe('CANCEL');
      },
    );

    it('asks the IT Admin to check when the grant of the person is being carried out, or they were withdrawn while it had failed', () => {
      expect(verdictOf(ALL, group(), 'EXECUTING')).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(OLD_DEPARTMENT, group(), 'EXECUTING')).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(ALL, group(), 'AWAITING_IT_CLOSE')).toBe('NEEDS_IT_CHECK');
      expect(verdictOf(OLD_DEPARTMENT, group(), 'AWAITING_IT_CLOSE')).toBe('NEEDS_IT_CHECK');
    });

    it('is judged by the line, not by the state of the request: the other people carry on', () => {
      expect(verdictOf(ALL, { ...group(), state: 'EXECUTING' }, 'APPROVED')).toBe('CANCEL');
      expect(verdictOf(ALL, { ...group(), state: 'AWAITING_EXECUTION' }, 'EXECUTING')).toBe('NEEDS_IT_CHECK');
    });

    it.each(
      LINE_STATES.filter(
        (line) => !['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED', 'EXECUTING', 'AWAITING_IT_CLOSE'].includes(line),
      ),
    )('leaves a line that has ended (%s)', (line) => {
      expect(verdictOf(ALL, group(), line)).toBe('SKIP');
    });

    it('leaves a group of the new department when only the old one is closed', () => {
      expect(verdictOf(OLD_DEPARTMENT, group(NEW), 'APPROVED')).toBe('SKIP');
    });

    it('leaves a group request when the person has no line in it', () => {
      expect(verdictOf(ALL, group(), null)).toBe('SKIP');
    });
  });

  describe('why the request ends', () => {
    it('is the departure for the person who left and the transfer for the person who was moved', () => {
      expect(goneCauseOf(ALL)).toBe('SYSTEM_BENEFICIARY_LEFT');
      expect(goneCauseOf(OLD_DEPARTMENT)).toBe('SYSTEM_BENEFICIARY_TRANSFERRED');
    });
  });
});
