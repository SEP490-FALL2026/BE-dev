import { beneficiaryCountOf, draftVerdict, kindOfType, REQUEST_TYPE_OF_KIND } from './request-draft.policy';

describe('the draft of a paid request (spec L.1, F27)', () => {
  describe('whose it is and whether it is still a draft', () => {
    const own = { requesterEmployeeId: 'sender', state: 'DRAFT' };

    it('is the sender’s while it is a draft', () => {
      expect(draftVerdict(own, 'sender')).toBe('OK');
    });

    it('is answered as a request that does not exist to anybody else, so a draft cannot be probed', () => {
      expect(draftVerdict(own, 'somebody-else')).toBe('NOT_FOUND');
      expect(draftVerdict(null, 'sender')).toBe('NOT_FOUND');
      // Even a request that was sent: it is not theirs, and nothing is said of it.
      expect(draftVerdict({ requesterEmployeeId: 'sender', state: 'PENDING' }, 'somebody-else')).toBe('NOT_FOUND');
    });

    it.each(['PENDING', 'AWAITING_SPEND_SUBMISSION', 'WITHDRAWN', 'COMPLETED'])(
      'is not a draft any more once the sender’s own request is %s',
      (state) => {
        expect(draftVerdict({ requesterEmployeeId: 'sender', state }, 'sender')).toBe('NOT_DRAFT');
      },
    );
  });

  describe('what it becomes', () => {
    it('is a request of one person or a request for a group; a service account is no kind of draft any more (QĐ-110m)', () => {
      expect(REQUEST_TYPE_OF_KIND).toEqual({ INDIVIDUAL: 'GRANT', GROUP: 'GROUP_GRANT' });
      expect(kindOfType('GRANT')).toBe('INDIVIDUAL');
      expect(kindOfType('GROUP_GRANT')).toBe('GROUP');
      expect(kindOfType('SERVICE_ACCOUNT')).toBeNull();
    });

    it('is never a renewal', () => {
      expect(kindOfType('RENEWAL')).toBeNull();
    });
  });

  describe('how many people it is for', () => {
    it('is one for a request of one person', () => {
      expect(beneficiaryCountOf({ kind: 'INDIVIDUAL' })).toBe(1);
    });

    it('is the people named of a group, each once', () => {
      expect(
        beneficiaryCountOf({
          kind: 'GROUP',
          lines: [{ employeeId: 'a' }, { employeeId: 'b' }, { employeeId: 'a' }],
        }),
      ).toBe(2);
      expect(beneficiaryCountOf({ kind: 'GROUP' })).toBe(0);
    });
  });
});
