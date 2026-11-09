import {
  checkLineClosure,
  checkLineTransferClosure,
  lineCancelledDetail,
  needsEvidenceAtOnce,
  soleLiveLine,
} from './group-line-closure.policy';
import { LINE_STATES, type LineState } from '../access-request/group-request.types';

describe('removing a person who left from a request for a group (US-03-04 AC-25, US-05-17)', () => {
  it.each(['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED', 'EXECUTING'] as const)(
    'closes the line of a person who left while it is %s',
    (lineState) => {
      expect(checkLineClosure({ lineState, beneficiaryLeft: true })).toBeNull();
    },
  );

  it.each(['NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED', 'CANCELLED'] as const)(
    'has nothing to close on a line that ended as %s, whether or not the person left',
    (lineState) => {
      expect(checkLineClosure({ lineState, beneficiaryLeft: true })).toBe('ALREADY_ENDED');
      expect(checkLineClosure({ lineState, beneficiaryLeft: false })).toBe('ALREADY_ENDED');
    },
  );

  it('leaves a line that waits for the IT Admin to close the task of a withdrawal to that way', () => {
    expect(checkLineClosure({ lineState: 'AWAITING_IT_CLOSE', beneficiaryLeft: true })).toBe('WITHDRAWAL_PENDING');
  });

  it.each(['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED', 'EXECUTING'] as const)(
    'only lists the line while the person still works, handing over included (%s)',
    (lineState) => {
      expect(checkLineClosure({ lineState, beneficiaryLeft: false })).toBe('BENEFICIARY_NOT_LEFT');
    },
  );

  it('gives one answer to every state of a line', () => {
    for (const lineState of LINE_STATES) {
      expect(() => checkLineClosure({ lineState, beneficiaryLeft: true })).not.toThrow();
    }
  });
});

describe('the person a whole-request closing means', () => {
  const line = (employeeId: string, state: LineState) => ({ employeeId, state });

  it('is the one person whose line is the only one still live', () => {
    expect(soleLiveLine([line('a', 'WITHDRAWN'), line('b', 'APPROVED'), line('c', 'COMPLETED')])).toBe('b');
    expect(soleLiveLine([line('a', 'AWAITING_IT_CLOSE')])).toBe('a');
  });

  it('is nobody when none or several lines are live, so the IT Admin names the person who left', () => {
    expect(soleLiveLine([line('a', 'WITHDRAWN'), line('b', 'CANCELLED')])).toBeNull();
    expect(soleLiveLine([line('a', 'APPROVED'), line('b', 'AWAITING_NEED')])).toBeNull();
    expect(soleLiveLine([])).toBeNull();
  });
});

describe('removing a person who was transferred from a request for a group (F29, QĐ-90b)', () => {
  it.each(['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED', 'EXECUTING'] as const)(
    'closes the line of a person who was transferred while it is %s',
    (lineState) => {
      expect(checkLineTransferClosure({ lineState, beneficiaryTransferred: true })).toBeNull();
    },
  );

  it.each(['NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED', 'CANCELLED'] as const)(
    'has nothing to close on a line that ended as %s: a seat that is real is not cancelled',
    (lineState) => {
      expect(checkLineTransferClosure({ lineState, beneficiaryTransferred: true })).toBe('ALREADY_ENDED');
    },
  );

  it('leaves a line that waits for the IT Admin to close a withdrawal to that way', () => {
    expect(checkLineTransferClosure({ lineState: 'AWAITING_IT_CLOSE', beneficiaryTransferred: true })).toBe(
      'WITHDRAWAL_PENDING',
    );
  });

  it('refuses a person who was not transferred away from the department the request was sent from', () => {
    expect(checkLineTransferClosure({ lineState: 'APPROVED', beneficiaryTransferred: false })).toBe(
      'BENEFICIARY_NOT_TRANSFERRED',
    );
  });
});

describe('what closing the line of a person asks for at once, and what it records (US-03-04 AC-25, QĐ-77f)', () => {
  it('asks for the confirmation of the check with the vendor when a transfer closes a line that is being carried out', () => {
    expect(needsEvidenceAtOnce('BENEFICIARY_TRANSFERRED', 'EXECUTING', undefined)).toBe(true);
  });

  it.each([
    ['the evidence is given', 'BENEFICIARY_TRANSFERRED', 'EXECUTING', 'Đã kiểm tra với nhà cung cấp'],
    ['the line is not being carried out', 'BENEFICIARY_TRANSFERRED', 'APPROVED', undefined],
    ['the person left', 'BENEFICIARY_LEFT', 'EXECUTING', undefined],
  ] as const)('asks for nothing at once when %s', (_label, cause, lineState, evidence) => {
    expect(needsEvidenceAtOnce(cause, lineState, evidence)).toBe(false);
  });

  it('records the line as cancelled, from the state it was in, with the cause, the hand, the task cancelled with it and what went back', () => {
    expect(
      lineCancelledDetail(
        { id: 'req-1', requesterEmployeeId: 'sender' },
        { employeeId: 'emp-2', from: 'EXECUTING', cause: 'BENEFICIARY_LEFT', actorEmployeeId: 'it-1' },
        { taskId: 'task-1', taskStatus: 'QUEUED' },
        true,
      ),
    ).toEqual({
      requestId: 'req-1',
      beneficiaryEmployeeId: 'emp-2',
      from: 'EXECUTING',
      to: 'CANCELLED',
      reasonKind: 'BENEFICIARY_LEFT',
      cancelledByEmployeeId: 'it-1',
      requesterEmployeeId: 'sender',
      taskId: 'task-1',
      taskStatusBefore: 'QUEUED',
      released: true,
    });
  });

  it('records no task when the line had none', () => {
    expect(
      lineCancelledDetail(
        { id: 'req-1', requesterEmployeeId: 'sender' },
        { employeeId: 'emp-2', from: 'AWAITING_NEED', cause: 'BENEFICIARY_TRANSFERRED', actorEmployeeId: 'it-1' },
        null,
        false,
      ),
    ).toMatchObject({ taskId: null, taskStatusBefore: null, released: false });
  });
});
