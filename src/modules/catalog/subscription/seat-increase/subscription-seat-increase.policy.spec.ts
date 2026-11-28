import {
  seatIncreaseNoticeOwed,
  seatIncreaseRecipients,
  seatReductionNoticeOwed,
  seatReductionRecipients,
} from './subscription-seat-increase.policy';

describe('subscription-seat-increase.policy (seat increase notice)', () => {
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

  describe('seatIncreaseRecipients: responsible IT Admin if usable, else Super Admin, never the actor', () => {
    it('notifies the responsible IT Admin when usable and not the actor', () => {
      expect(
        seatIncreaseRecipients({
          responsible: 'it-a',
          responsibleUsable: true,
          superAdmin: 'sa-1',
          actor: 'it-b',
        }),
      ).toEqual(['it-a']);
    });

    it('notifies nobody when the usable responsible IT Admin is the actor', () => {
      expect(
        seatIncreaseRecipients({
          responsible: 'it-a',
          responsibleUsable: true,
          superAdmin: 'sa-1',
          actor: 'it-a',
        }),
      ).toEqual([]);
    });

    it('falls back to Super Admin when no responsible IT Admin is assigned', () => {
      expect(
        seatIncreaseRecipients({
          responsible: null,
          responsibleUsable: false,
          superAdmin: 'sa-1',
          actor: 'it-b',
        }),
      ).toEqual(['sa-1']);
    });

    it('falls back to Super Admin when responsible IT Admin is unusable', () => {
      expect(
        seatIncreaseRecipients({
          responsible: 'left',
          responsibleUsable: false,
          superAdmin: 'sa-1',
          actor: 'it-b',
        }),
      ).toEqual(['sa-1']);
    });

    it('notifies nobody when falling back to Super Admin and Super Admin is the actor', () => {
      expect(
        seatIncreaseRecipients({
          responsible: 'left',
          responsibleUsable: false,
          superAdmin: 'sa-1',
          actor: 'sa-1',
        }),
      ).toEqual([]);
    });

    it('notifies nobody when neither responsible IT Admin nor Super Admin is usable', () => {
      expect(
        seatIncreaseRecipients({
          responsible: null,
          responsibleUsable: false,
          superAdmin: null,
          actor: 'it-b',
        }),
      ).toEqual([]);
    });
  });

  describe('W3-03 seatReductionNoticeOwed & seatReductionRecipients (R1 + R2)', () => {
    it.each([
      ['K2', 'ACTIVE', 12, 11, true],
      ['K2', 'ACTIVE', 11, 12, false],
      ['K2', 'ACTIVE', 12, 12, false],
      ['K2', 'DRAFT', 12, 11, false],
      ['K1', 'ACTIVE', 12, 11, false],
      ['K4', 'ACTIVE', 12, 11, false],
    ] as const)(
      'a %s %s subscription going from %s to %s owes reduction notice: %s',
      (type, status, from, to, owed) => {
        expect(seatReductionNoticeOwed({ planProvisioningType: type, status, from, to })).toBe(owed);
      },
    );

    it('notifies responsible IT Admin + Finance when another IT Admin reduces seats', () => {
      expect(
        seatReductionRecipients({
          responsible: 'khoa',
          responsibleUsable: true,
          superAdmin: 'sa',
          finance: 'fin',
          actor: 'nam',
        }),
      ).toEqual(['khoa', 'fin']);
    });

    it('notifies only Finance when the usable responsible IT Admin reduces seats themselves', () => {
      expect(
        seatReductionRecipients({
          responsible: 'khoa',
          responsibleUsable: true,
          superAdmin: 'sa',
          finance: 'fin',
          actor: 'khoa',
        }),
      ).toEqual(['fin']);
    });

    it('falls back to Super Admin + Finance when the responsible IT Admin account is locked/unusable', () => {
      expect(
        seatReductionRecipients({
          responsible: 'khoa',
          responsibleUsable: false,
          superAdmin: 'sa',
          finance: 'fin',
          actor: 'nam',
        }),
      ).toEqual(['sa', 'fin']);
    });
  });
});
