import { revocationOf, type RevocationFacts } from './out-of-process-revocation.policy';

/** Tuesday 04/08/2026 is the day the case is concluded on a company asset: the first of the ten working days (US-13-05 AC-23). */
const CONCLUDED = '2026-08-04';
const NO_HOLIDAYS: ReadonlySet<string> = new Set();

const open = (over: Partial<RevocationFacts> = {}): RevocationFacts => ({
  state: 'OPEN',
  companyAsset: true,
  concludedOn: CONCLUDED,
  today: '2026-08-05',
  nonWorkingDates: NO_HOLIDAYS,
  request: null,
  ...over,
});

describe('the revocation a case outside the process asks of the IT Admin (US-13-05 AC-20, AC-23, AC-24)', () => {
  describe('which cases ask for one', () => {
    it('asks nothing of a case on a personal account: it is only recorded (AC-21, AC-24 (c))', () => {
      expect(revocationOf(open({ companyAsset: false }))).toEqual({
        required: false,
        waitingRequestId: null,
        waitUntil: null,
        due: false,
      });
    });

    it('asks nothing of a case opened before the question of the company asset was asked', () => {
      expect(revocationOf(open({ companyAsset: null })).required).toBe(false);
    });

    it('asks nothing of a case that is closed, whatever it was closed as: the revocation is done or no longer needed', () => {
      expect(revocationOf(open({ state: 'CLOSED' }))).toEqual({
        required: false,
        waitingRequestId: null,
        waitUntil: null,
        due: false,
      });
    });

    it('asks nothing of a case that has no day it was concluded on, as it was opened before that was kept', () => {
      expect(revocationOf(open({ concludedOn: null })).required).toBe(false);
    });
  });

  describe('the person sent no Request for the software (AC-20)', () => {
    it('is due the day the case is concluded: there is nothing to wait for, no ceiling to count', () => {
      expect(revocationOf(open({ today: CONCLUDED }))).toEqual({
        required: true,
        waitingRequestId: null,
        waitUntil: null,
        due: true,
      });
    });
  });

  describe('the person has a Request that has not reached the step of the spending approver (AC-23)', () => {
    const waiting = { id: 'R71', stage: 'BEFORE_SPEND' as const, reachedSpendOn: null };

    it('waits for it up to the tenth working day, the day of the conclusion counting as the first: 04/08 gives 17/08', () => {
      const onTheCeiling = revocationOf(open({ request: waiting, today: '2026-08-17' }));

      expect(onTheCeiling).toEqual({ required: true, waitingRequestId: 'R71', waitUntil: '2026-08-17', due: false });
    });

    it('is due the day after the ceiling, and the Request goes on its way', () => {
      const after = revocationOf(open({ request: waiting, today: '2026-08-18' }));

      expect(after).toEqual({ required: true, waitingRequestId: 'R71', waitUntil: '2026-08-17', due: true });
    });

    it('does not count a day nobody works: with 10/08 off the ceiling is 18/08', () => {
      const off = new Set(['2026-08-10']);

      expect(revocationOf(open({ request: waiting, today: '2026-08-18', nonWorkingDates: off }))).toMatchObject({
        waitUntil: '2026-08-18',
        due: false,
      });
      expect(revocationOf(open({ request: waiting, today: '2026-08-19', nonWorkingDates: off })).due).toBe(true);
    });

    it('counts a conclusion on a Saturday from the Monday after: 08/08 gives 21/08', () => {
      const onSaturday = open({ request: waiting, concludedOn: '2026-08-08', today: '2026-08-21' });

      expect(revocationOf(onSaturday)).toMatchObject({ waitUntil: '2026-08-21', due: false });
      expect(revocationOf({ ...onSaturday, today: '2026-08-24' }).due).toBe(true);
    });
  });

  describe('the person has a Request that reached the step of the spending approver (AC-23)', () => {
    it('waits on for the decision with no ceiling, even when it comes after the tenth working day', () => {
      const inTime = { id: 'R71', stage: 'AT_SPEND' as const, reachedSpendOn: '2026-08-12' };

      expect(revocationOf(open({ request: inTime, today: '2026-08-17' }))).toEqual({
        required: true,
        waitingRequestId: 'R71',
        waitUntil: null,
        due: false,
      });
      expect(revocationOf(open({ request: inTime, today: '2026-09-30' })).due).toBe(false);
    });

    it('is due when it only reached the step after the ceiling: the task was made at the ceiling and the Request goes on', () => {
      const late = { id: 'R71', stage: 'AT_SPEND' as const, reachedSpendOn: '2026-08-18' };

      expect(revocationOf(open({ request: late, today: '2026-08-19' }))).toEqual({
        required: true,
        waitingRequestId: 'R71',
        waitUntil: '2026-08-17',
        due: true,
      });
    });

    it('counts the day it reached the step as in time on the ceiling itself, and a day it has no record of as in time', () => {
      const onTheCeiling = { id: 'R71', stage: 'AT_SPEND' as const, reachedSpendOn: '2026-08-17' };
      const noRecord = { id: 'R71', stage: 'AT_SPEND' as const, reachedSpendOn: null };

      expect(revocationOf(open({ request: onTheCeiling, today: '2026-08-31' })).due).toBe(false);
      expect(revocationOf(open({ request: noRecord, today: '2026-08-31' })).due).toBe(false);
    });
  });

  describe('the Request was approved (AC-23)', () => {
    it('asks nothing for being outside the process: the grant goes by the task of the Request', () => {
      const approved = { id: 'R71', stage: 'APPROVED' as const, reachedSpendOn: '2026-08-12' };

      expect(revocationOf(open({ request: approved, today: '2026-09-30' }))).toEqual({
        required: false,
        waitingRequestId: null,
        waitUntil: null,
        due: false,
      });
    });
  });
});
