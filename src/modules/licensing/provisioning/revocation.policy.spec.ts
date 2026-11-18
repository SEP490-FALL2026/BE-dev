import {
  AssignmentNotOpenError,
  ProvisioningEvidenceRequiredError,
  ProvisioningTaskStateError,
  RevocationCompletionError,
  RevocationRefusedError,
  type RevocationCompletionProblem,
} from '../public/licensing.errors';
import { REVOCATION_SOURCES } from '../public/licensing.types';
import { doneWhenFor, stepsFor } from './provisioning.policy';
import {
  assertNotRevocationTask,
  assertRevocable,
  assertRevocationSource,
  assertRevocationTask,
  completionsFor,
  endFloor,
  isOpenAssignment,
  isTerminating,
  planAccessCut,
  planCompletion,
  type CompletionInput,
} from './revocation.policy';

const TODAY = '2026-10-24';
const STARTED = '2026-01-05';
const context = (type: 'K1' | 'K2' | 'K3' | 'K4' | 'K5', startsOn = STARTED) => ({ type, startsOn, today: TODAY });
const problemOf = (run: () => unknown): string | null => {
  try {
    run();

    return null;
  } catch (error) {
    if (error instanceof RevocationCompletionError) return error.problem;
    if (error instanceof RevocationRefusedError) return error.problem;
    if (error instanceof ProvisioningEvidenceRequiredError) return 'EVIDENCE_REQUIRED';
    if (error instanceof AssignmentNotOpenError) return 'NOT_OPEN';
    throw error;
  }
};

describe('the source of a revocation (US-07-05 AC-3, AC-11)', () => {
  it.each([undefined, '', ' ', 'SOMETHING_ELSE', 'return'])('refuses %p: no source says why', (source) => {
    expect(problemOf(() => assertRevocationSource(source))).toBe('SOURCE_REQUIRED');
  });

  it('accepts each of the fourteen sources and no other', () => {
    expect(REVOCATION_SOURCES).toHaveLength(14);
    for (const source of REVOCATION_SOURCES) expect(assertRevocationSource(source)).toBe(source);
  });
});

describe('which seat may be revoked (US-07-05 AC-8, US-03-04 AC-17)', () => {
  const personalOpen = { kind: 'PERSONAL', open: true, provisioningType: 'K2' } as const;

  // Rewritten for BR-MF1-09 / QĐ-103d: a K4 seat is revoked like any seat and its key goes back to the store; only K3 has no revocation.
  it.each(['K1', 'K2', 'K4', 'K5'] as const)('lets an open personal seat of %s be revoked', (provisioningType) => {
    expect(problemOf(() => assertRevocable({ ...personalOpen, provisioningType }))).toBeNull();
  });

  it('refuses a seat of K3, which has no revocation', () => {
    expect(problemOf(() => assertRevocable({ ...personalOpen, provisioningType: 'K3' }))).toBe('TYPE_NOT_SUPPORTED');
  });

  it('refuses a service account, whoever answers for it and whatever its kind', () => {
    expect(problemOf(() => assertRevocable({ ...personalOpen, kind: 'SERVICE' }))).toBe(
      'ASSIGNMENT_IS_SERVICE_ACCOUNT',
    );
  });

  it('refuses a seat that is no longer open', () => {
    expect(problemOf(() => assertRevocable({ ...personalOpen, open: false }))).toBe('NOT_OPEN');
  });

  it('judges in the order: a service account first, then an open seat, then the kind', () => {
    expect(problemOf(() => assertRevocable({ kind: 'SERVICE', open: false, provisioningType: 'K3' }))).toBe(
      'ASSIGNMENT_IS_SERVICE_ACCOUNT',
    );
    expect(problemOf(() => assertRevocable({ kind: 'PERSONAL', open: false, provisioningType: 'K3' }))).toBe(
      'NOT_OPEN',
    );
  });

  it('calls open only a seat nobody ended, failed or cancelled', () => {
    expect(isOpenAssignment({ validUntil: null, failedAt: null, cancelledAt: null })).toBe(true);
    expect(isOpenAssignment({ validUntil: '2026-11-30', failedAt: null, cancelledAt: null })).toBe(false);
    expect(isOpenAssignment({ validUntil: null, failedAt: new Date(), cancelledAt: null })).toBe(false);
    expect(isOpenAssignment({ validUntil: null, failedAt: null, cancelledAt: new Date() })).toBe(false);
  });

  it('keeps the completion of a grant and of a revocation apart', () => {
    expect(() => assertRevocationTask('REVOKE')).not.toThrow();
    expect(() => assertRevocationTask('GRANT')).toThrow(ProvisioningTaskStateError);
    expect(() => assertNotRevocationTask('GRANT')).not.toThrow();
    expect(() => assertNotRevocationTask('REVOKE')).toThrow(ProvisioningTaskStateError);
  });
});

describe('how a revocation is completed, by kind (US-07-05 AC-1, AC-4, AC-5, AC-8)', () => {
  it('has one way for K1, K4 and K5, two for K2, and none for K3', () => {
    expect(completionsFor('K1')).toEqual(['RENEWAL_CANCELLED']);
    expect(completionsFor('K2')).toEqual(['ACCOUNT_REMOVED', 'ALREADY_GONE']);
    expect(completionsFor('K4')).toEqual(['KEY_DEACTIVATED']);
    expect(completionsFor('K5')).toEqual(['OFF_SYSTEM_REVOKED']);
    expect(completionsFor('K3')).toEqual([]);
  });

  it.each([
    ['K5', 'ACCOUNT_REMOVED'],
    ['K2', 'OFF_SYSTEM_REVOKED'],
    ['K2', 'RENEWAL_CANCELLED'],
    ['K1', 'ACCOUNT_REMOVED'],
    ['K1', 'ALREADY_GONE'],
    ['K3', 'ACCOUNT_REMOVED'],
    ['K4', 'OFF_SYSTEM_REVOKED'],
    ['K2', 'KEY_DEACTIVATED'],
  ] as const)('refuses %s completed as %s', (type, completion) => {
    expect(problemOf(() => planCompletion({ completion, evidence: 'x' }, context(type)))).toBe(
      'COMPLETION_NOT_ALLOWED',
    );
  });

  it('refuses the fields of a K1 completion on any other way', () => {
    const problems = [
      { paidThroughOn: '2026-11-30' },
      { accessState: 'UNTIL_PAID_END' },
      { accessCutOn: '2026-10-20' },
      { accessEvidence: 'x' },
    ].map((extra) =>
      problemOf(() =>
        planCompletion({ completion: 'ACCOUNT_REMOVED', evidence: 'x', ...extra } as CompletionInput, context('K2')),
      ),
    );

    expect(problems).toEqual(Array(4).fill('COMPLETION_NOT_ALLOWED'));
  });

  describe('K2 and K5 give the seat back today', () => {
    it('ends a K2 seat removed today', () => {
      const plan = planCompletion({ completion: 'ACCOUNT_REMOVED', evidence: ' đã xóa tài khoản ' }, context('K2'));

      expect(plan).toMatchObject({
        completion: 'ACCOUNT_REMOVED',
        evidence: 'đã xóa tài khoản',
        note: null,
        paidThroughOn: null,
        accessState: null,
        endOn: TODAY,
      });
    });

    it('ends a K5 seat revoked off the system today, with the evidence', () => {
      expect(planCompletion({ completion: 'OFF_SYSTEM_REVOKED', evidence: 'đã thu hồi' }, context('K5')).endOn).toBe(
        TODAY,
      );
    });

    it.each(['', '   '])('needs evidence that is not blank (%p)', (evidence) => {
      expect(problemOf(() => planCompletion({ completion: 'ACCOUNT_REMOVED', evidence }, context('K2')))).toBe(
        'EVIDENCE_REQUIRED',
      );
    });

    it('ends the seat of someone who began today tomorrow: its period is never empty', () => {
      expect(planCompletion({ completion: 'ACCOUNT_REMOVED', evidence: 'x' }, context('K2', TODAY)).endOn).toBe(
        '2026-10-25',
      );
      expect(endFloor('2026-12-31')).toBe('2027-01-01');
    });

    it('ends the seat of someone who begins later the day after they begin', () => {
      expect(planCompletion({ completion: 'ACCOUNT_REMOVED', evidence: 'x' }, context('K2', '2026-11-02')).endOn).toBe(
        '2026-11-03',
      );
    });
  });

  describe('an account that was already gone (AC-4)', () => {
    it('needs the note of who confirmed it, and takes it as the evidence when none is given', () => {
      const plan = planCompletion(
        { completion: 'ALREADY_GONE', evidence: '', note: ' người dùng tự xóa ' },
        context('K2'),
      );

      expect(plan).toMatchObject({
        completion: 'ALREADY_GONE',
        note: 'người dùng tự xóa',
        evidence: 'người dùng tự xóa',
      });
      expect(plan.endOn).toBe(TODAY);
    });

    it('keeps the evidence it is given beside the note', () => {
      expect(
        planCompletion({ completion: 'ALREADY_GONE', evidence: 'ảnh chụp danh sách', note: 'tự xóa' }, context('K2')),
      ).toMatchObject({ evidence: 'ảnh chụp danh sách', note: 'tự xóa' });
    });

    it.each([undefined, '', '  '])('refuses a note of %p', (note) => {
      expect(problemOf(() => planCompletion({ completion: 'ALREADY_GONE', evidence: 'x', note }, context('K2')))).toBe(
        'NOTE_REQUIRED',
      );
    });
  });

  describe('K1: the renewal is cancelled and the state of the access is always stored (AC-5, AC-19)', () => {
    const renewal = (extra: Partial<CompletionInput>): CompletionInput => ({
      completion: 'RENEWAL_CANCELLED',
      evidence: 'đã hủy gia hạn',
      paidThroughOn: '2026-11-30',
      ...extra,
    });

    it('ends a seat whose access runs on at the end of the paid period', () => {
      const plan = planCompletion(renewal({ accessState: 'UNTIL_PAID_END' }), context('K1'));

      expect(plan).toMatchObject({
        accessState: 'UNTIL_PAID_END',
        paidThroughOn: '2026-11-30',
        accessCutOn: null,
        accessEvidence: null,
        endOn: '2026-11-30',
      });
    });

    it('ends a seat whose access was cut the day it was cut, when that is before the end of the period', () => {
      const plan = planCompletion(
        renewal({ accessState: 'CUT', accessCutOn: '2026-10-20', accessEvidence: ' đã khóa ' }),
        context('K1'),
      );

      expect(plan).toMatchObject({
        accessState: 'CUT',
        accessCutOn: '2026-10-20',
        accessEvidence: 'đã khóa',
        endOn: '2026-10-20',
      });
    });

    it('never ends a seat after the paid period, whatever the day the access was cut', () => {
      const plan = planCompletion(
        renewal({ paidThroughOn: '2026-10-10', accessState: 'CUT', accessCutOn: '2026-10-20', accessEvidence: 'x' }),
        context('K1'),
      );

      expect(plan.endOn).toBe('2026-10-10');
    });

    it('keeps the floor of a day after the start', () => {
      expect(
        planCompletion(
          renewal({ accessState: 'CUT', accessCutOn: '2026-10-24', accessEvidence: 'x', paidThroughOn: '2026-10-24' }),
          context('K1', TODAY),
        ).endOn,
      ).toBe('2026-10-25');
      expect(
        planCompletion(renewal({ paidThroughOn: '2026-01-01', accessState: 'UNTIL_PAID_END' }), context('K1')).endOn,
      ).toBe('2026-01-06');
    });

    it('stores nothing without the end of the paid period or without the state of the access', () => {
      expect(
        problemOf(() =>
          planCompletion(renewal({ paidThroughOn: undefined, accessState: 'UNTIL_PAID_END' }), context('K1')),
        ),
      ).toBe('PAID_THROUGH_REQUIRED');
      expect(problemOf(() => planCompletion(renewal({}), context('K1')))).toBe('ACCESS_STATE_REQUIRED');
    });

    it.each<[string, Partial<CompletionInput>, RevocationCompletionProblem]>([
      ['a cut with no day', { accessState: 'CUT', accessEvidence: 'x' }, 'ACCESS_STATE_REQUIRED'],
      ['a cut with no evidence', { accessState: 'CUT', accessCutOn: '2026-10-20' }, 'ACCESS_STATE_REQUIRED'],
      [
        'a cut with blank evidence',
        { accessState: 'CUT', accessCutOn: '2026-10-20', accessEvidence: ' ' },
        'ACCESS_STATE_REQUIRED',
      ],
      [
        'a cut on a day ahead',
        { accessState: 'CUT', accessCutOn: '2026-10-25', accessEvidence: 'x' },
        'ACCESS_STATE_INVALID',
      ],
      [
        'a run-on access with a cut day',
        { accessState: 'UNTIL_PAID_END', accessCutOn: '2026-10-20' },
        'ACCESS_STATE_INVALID',
      ],
      [
        'a run-on access with cut evidence',
        { accessState: 'UNTIL_PAID_END', accessEvidence: 'x' },
        'ACCESS_STATE_INVALID',
      ],
    ])('refuses %s', (_name, extra, problem) => {
      expect(problemOf(() => planCompletion(renewal(extra), context('K1')))).toBe(problem);
    });

    it('needs the evidence of the cancellation too', () => {
      expect(
        problemOf(() => planCompletion(renewal({ evidence: ' ', accessState: 'UNTIL_PAID_END' }), context('K1'))),
      ).toBe('EVIDENCE_REQUIRED');
    });
  });
});

describe('the access of a terminating K1 seat cut early (US-07-05 AC-19)', () => {
  const at = { today: TODAY, startsOn: STARTED, validUntil: '2026-11-30' };

  it('brings the end of the seat forward to the day the access was cut', () => {
    expect(planAccessCut({ accessCutOn: '2026-11-12', evidence: ' đã khóa ' }, { ...at, today: '2026-11-12' })).toEqual(
      {
        accessCutOn: '2026-11-12',
        accessEvidence: 'đã khóa',
        endOn: '2026-11-12',
      },
    );
  });

  it('records a cut on or after the end the seat has without moving it', () => {
    expect(
      planAccessCut({ accessCutOn: '2026-10-24', evidence: 'x' }, { ...at, validUntil: '2026-10-24' }).endOn,
    ).toBeNull();
    expect(
      planAccessCut({ accessCutOn: '2026-10-24', evidence: 'x' }, { ...at, validUntil: '2026-10-20' }).endOn,
    ).toBeNull();
  });

  it('keeps the floor of a day after the start', () => {
    expect(planAccessCut({ accessCutOn: '2026-10-01', evidence: 'x' }, { ...at, startsOn: '2026-10-20' }).endOn).toBe(
      '2026-10-21',
    );
  });

  it('refuses a day ahead and a cut with no evidence', () => {
    expect(problemOf(() => planAccessCut({ accessCutOn: '2026-10-25', evidence: 'x' }, at))).toBe(
      'ACCESS_STATE_INVALID',
    );
    expect(problemOf(() => planAccessCut({ accessCutOn: '2026-10-20', evidence: '  ' }, at))).toBe('EVIDENCE_REQUIRED');
  });
});

describe('a seat that is ending while its access runs on (US-07-05 AC-19)', () => {
  const done = { kind: 'REVOKE', status: 'COMPLETED', accessState: 'UNTIL_PAID_END' } as const;

  it('is terminating while the end of the paid period is ahead', () => {
    expect(isTerminating(done, '2026-11-30', TODAY)).toBe(true);
  });

  it.each([
    ['the day comes', { ...done }, '2026-10-24'],
    ['the day has passed', { ...done }, '2026-10-01'],
    ['the access was cut', { ...done, accessState: 'CUT' as const }, '2026-11-30'],
    ['the task is not completed', { ...done, status: 'IN_PROGRESS' as const }, '2026-11-30'],
    ['the task is a grant', { ...done, kind: 'GRANT' as const }, '2026-11-30'],
    ['the seat has no end', { ...done }, null],
  ])('is not terminating when %s', (_name, task, validUntil) => {
    expect(isTerminating(task, validUntil, TODAY)).toBe(false);
  });
});

describe('the card of a revocation (US-07-05 AC-1, AC-5, AC-8)', () => {
  it('names the steps of each kind, and the identity of whoever works a K2 removal', () => {
    expect(stepsFor('K1', 'a@x.vn', 'REVOKE').map((step) => step.code)).toEqual([
      'CANCEL_RENEWAL_ON_PROVIDER',
      'RECORD_ACCESS_STATE',
      'CONFIRM_WITH_EVIDENCE',
    ]);
    expect(stepsFor('K2', 'a@x.vn', 'REVOKE')).toEqual([
      { code: 'REMOVE_FROM_WORKSPACE', adminIdentity: 'ACTING_IT_ADMIN' },
      { code: 'CONFIRM_WITH_EVIDENCE' },
    ]);
    expect(stepsFor('K5', 'a@x.vn', 'REVOKE').map((step) => step.code)).toEqual([
      'REVOKE_IN_INTERNAL_SOFTWARE',
      'CONFIRM_WITH_EVIDENCE',
    ]);
    expect(stepsFor('K3', 'a@x.vn', 'REVOKE')).toEqual([]);
    expect(stepsFor('K4', 'a@x.vn', 'REVOKE').map((step) => step.code)).toEqual([
      'DEACTIVATE_KEY_ON_DEVICE',
      'CONFIRM_WITH_EVIDENCE',
    ]);
  });

  it('says when each kind is done, and leaves the grant as it was', () => {
    expect(doneWhenFor('K1', 'REVOKE')).toBe('RENEWAL_CANCELLED_WITH_ACCESS_STATE');
    expect(doneWhenFor('K2', 'REVOKE')).toBe('ACCOUNT_REMOVED_OR_NOT_NEEDED');
    expect(doneWhenFor('K5', 'REVOKE')).toBe('REVOKED_OFF_SYSTEM_WITH_EVIDENCE');
    expect(doneWhenFor('K2')).toBe('MEMBER_ACTIVE');
    expect(stepsFor('K2', 'a@x.vn').map((step) => step.code)).toEqual(['ADD_TO_WORKSPACE', 'CONFIRM_WITH_EVIDENCE']);
  });
});
