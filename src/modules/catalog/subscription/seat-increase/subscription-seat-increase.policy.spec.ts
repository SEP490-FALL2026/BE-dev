import { seatIncreaseNoticeOwed, seatIncreaseRecipients } from './subscription-seat-increase.policy';

describe('subscription-seat-increase.policy (QĐ-110v, S-4: the IT Admin of a pool is told when its seats grow)', () => {
  describe('seatIncreaseNoticeOwed: only a K2 or K4 pool whose bought seats rise', () => {
    it.each([
      ['K2', 10, 11, true],
      ['K4', 5, 9, true],
      ['K2', 10, 10, false],
      ['K2', 10, 9, false],
      ['K2', null, 5, false],
      ['K2', 10, null, false],
      ['K1', 10, 11, false],
      ['K5', 10, 11, false],
      ['K3', 10, 11, false],
    ] as const)('a %s subscription going from %s to %s is told: %s', (type, from, to, owed) => {
      expect(seatIncreaseNoticeOwed({ planProvisioningType: type, status: 'ACTIVE', from, to })).toBe(owed);
    });

    it('tells nothing of a draft: its seats are not bought yet, whatever number a change gives them', () => {
      expect(seatIncreaseNoticeOwed({ planProvisioningType: 'K2', status: 'DRAFT', from: 10, to: 20 })).toBe(false);
    });
  });

  describe('seatIncreaseRecipients: the one who answers for the subscription, or every IT Admin when nobody usable does; never the one who bought', () => {
    const base = { responsible: 'it-a', usable: new Set(['it-a', 'it-b', 'it-c']), actor: 'it-b' };

    it('tells the IT Admin who answers for the subscription when someone else bought', () => {
      expect(seatIncreaseRecipients(base)).toEqual(['it-a']);
    });

    it('tells nobody when the IT Admin who answers for it is the one who bought', () => {
      expect(seatIncreaseRecipients({ ...base, actor: 'it-a' })).toEqual([]);
    });

    it('tells every other IT Admin when nobody answers for the subscription', () => {
      expect(seatIncreaseRecipients({ ...base, responsible: null })).toEqual(['it-a', 'it-c']);
    });

    it('tells every other IT Admin when the one who answers for it no longer works as one', () => {
      expect(seatIncreaseRecipients({ ...base, responsible: 'left', actor: 'it-b' })).toEqual(['it-a', 'it-c']);
    });

    it('tells nobody when nobody else is an IT Admin who works', () => {
      expect(seatIncreaseRecipients({ responsible: null, usable: new Set(['it-b']), actor: 'it-b' })).toEqual([]);
    });
  });
});
