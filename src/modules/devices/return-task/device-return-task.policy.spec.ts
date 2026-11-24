import {
  isOverdue,
  judgeReturnTaskCompletion,
  returnDueOn,
  shouldClearOverdueNotice,
  shouldRemindOn,
  type ReturnTaskState,
} from './device-return-task.policy';

describe('device-return-task.policy', () => {
  describe('returnDueOn', () => {
    it.each([
      {
        accessBlockMode: 'BLOCK_NOW' as const,
        lastWorkingDay: '2026-11-30',
        today: '2026-11-25',
        expected: '2026-11-25',
      },
      {
        accessBlockMode: 'WITH_LAST_DAY' as const,
        lastWorkingDay: '2026-11-30',
        today: '2026-11-25',
        expected: '2026-11-30',
      },
      { accessBlockMode: 'WITH_LAST_DAY' as const, lastWorkingDay: null, today: '2026-11-25', expected: '2026-11-25' },
    ])(
      '$accessBlockMode with lastWorkingDay=$lastWorkingDay -> $expected',
      ({ accessBlockMode, lastWorkingDay, today, expected }) => {
        expect(returnDueOn({ accessBlockMode, lastWorkingDay, today })).toBe(expected);
      },
    );
  });

  describe('isOverdue', () => {
    it.each<{ state: ReturnTaskState; dueOn: string; today: string; expected: boolean }>([
      { state: 'OPEN', dueOn: '2026-11-24', today: '2026-11-25', expected: true },
      { state: 'OPEN', dueOn: '2026-11-25', today: '2026-11-25', expected: false },
      { state: 'OPEN', dueOn: '2026-11-26', today: '2026-11-25', expected: false },
      { state: 'RECEIVED', dueOn: '2026-11-24', today: '2026-11-25', expected: false },
      { state: 'NOT_RECOVERED', dueOn: '2026-11-24', today: '2026-11-25', expected: false },
      { state: 'CANCELLED', dueOn: '2026-11-24', today: '2026-11-25', expected: false },
    ])('$state due=$dueOn today=$today -> $expected', (input) => {
      expect(isOverdue(input)).toBe(input.expected);
    });
  });

  describe('shouldRemindOn', () => {
    it.each<{
      label: string;
      state: ReturnTaskState;
      dueOn: string;
      overdueNoticedOn: string | null;
      today: string;
      isWorkingDay: boolean;
      expected: boolean;
    }>([
      {
        label: 'overdue task on a working day with no prior notice sends reminder',
        state: 'OPEN',
        dueOn: '2026-11-24',
        overdueNoticedOn: null,
        today: '2026-11-25',
        isWorkingDay: true,
        expected: true,
      },
      {
        label: 'overdue task already noticed on an earlier working day sends again today',
        state: 'OPEN',
        dueOn: '2026-11-24',
        overdueNoticedOn: '2026-11-25',
        today: '2026-11-26',
        isWorkingDay: true,
        expected: true,
      },
      {
        label: 'same working day notice suppresses duplicate reminder',
        state: 'OPEN',
        dueOn: '2026-11-24',
        overdueNoticedOn: '2026-11-25',
        today: '2026-11-25',
        isWorkingDay: true,
        expected: false,
      },
      {
        label: 'non-working day suppresses reminder',
        state: 'OPEN',
        dueOn: '2026-11-24',
        overdueNoticedOn: null,
        today: '2026-11-28',
        isWorkingDay: false,
        expected: false,
      },
      {
        label: 'task due today or later is not reminded',
        state: 'OPEN',
        dueOn: '2026-11-25',
        overdueNoticedOn: null,
        today: '2026-11-25',
        isWorkingDay: true,
        expected: false,
      },
      {
        label: 'closed task is never reminded',
        state: 'RECEIVED',
        dueOn: '2026-11-24',
        overdueNoticedOn: null,
        today: '2026-11-25',
        isWorkingDay: true,
        expected: false,
      },
    ])('$label -> $expected', (input) => {
      expect(shouldRemindOn(input)).toBe(input.expected);
    });
  });

  describe('shouldClearOverdueNotice', () => {
    it.each([
      { newDueOn: '2026-11-25', today: '2026-11-25', expected: true },
      { newDueOn: '2026-11-26', today: '2026-11-25', expected: true },
      { newDueOn: '2026-11-24', today: '2026-11-25', expected: false },
    ])('$newDueOn vs $today -> $expected', (input) => {
      expect(shouldClearOverdueNotice(input)).toBe(input.expected);
    });
  });

  describe('judgeReturnTaskCompletion', () => {
    it.each([
      {
        label: 'RECEIVED requires condition and softwareRemoval without reason or activationDecisions',
        outcome: 'RECEIVED' as const,
        hasCondition: true,
        softwareRemoval: { outcome: 'REMOVED' as const, note: null },
        reason: null,
        hasActivationDecisions: false,
        expected: 'OK',
      },
      {
        label: 'RECEIVED with NOT_REMOVABLE requires non-empty note',
        outcome: 'RECEIVED' as const,
        hasCondition: true,
        softwareRemoval: { outcome: 'NOT_REMOVABLE' as const, note: '   ' },
        reason: null,
        hasActivationDecisions: false,
        expected: 'SOFTWARE_REMOVAL_NOTE_REQUIRED',
      },
      {
        label: 'RECEIVED rejects missing condition',
        outcome: 'RECEIVED' as const,
        hasCondition: false,
        softwareRemoval: { outcome: 'REMOVED' as const, note: null },
        reason: null,
        hasActivationDecisions: false,
        expected: 'OUTCOME_FIELDS_INVALID',
      },
      {
        label: 'RECEIVED rejects reason or activationDecisions',
        outcome: 'RECEIVED' as const,
        hasCondition: true,
        softwareRemoval: { outcome: 'REMOVED' as const, note: null },
        reason: 'extra',
        hasActivationDecisions: false,
        expected: 'OUTCOME_FIELDS_INVALID',
      },
      {
        label: 'NOT_RECOVERED requires reason and forbids condition or softwareRemoval',
        outcome: 'NOT_RECOVERED' as const,
        hasCondition: false,
        softwareRemoval: null,
        reason: 'Employee unreachable',
        hasActivationDecisions: true,
        expected: 'OK',
      },
      {
        label: 'NOT_RECOVERED rejects blank reason',
        outcome: 'NOT_RECOVERED' as const,
        hasCondition: false,
        softwareRemoval: null,
        reason: '   ',
        hasActivationDecisions: false,
        expected: 'OUTCOME_FIELDS_INVALID',
      },
      {
        label: 'NOT_RECOVERED rejects condition or softwareRemoval',
        outcome: 'NOT_RECOVERED' as const,
        hasCondition: true,
        softwareRemoval: null,
        reason: 'Lost',
        hasActivationDecisions: false,
        expected: 'OUTCOME_FIELDS_INVALID',
      },
    ])('$label -> $expected', (input) => {
      expect(judgeReturnTaskCompletion(input)).toBe(input.expected);
    });
  });
});
