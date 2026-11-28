import {
  batchItemSchema,
  queueItemSchema,
  submitBatchBodySchema,
  submitResultSchema,
} from '../spend/spend-submission.dto';

const REQ_1 = '00000000-0000-4000-8000-000000000001';
const HEAD = '00000000-0000-4000-8000-0000000000f1';
const TICKET_1 = '00000000-0000-4000-8000-000000000101';

describe('spend-submission DTOs (Trọng tâm 5 & §8.3)', () => {
  it('accepts 1000-char replyNotes[].note and rejects whitespace-only and 1001-char notes', () => {
    const valid = submitBatchBodySchema.safeParse({
      requestIds: [REQ_1],
      replyNotes: [{ requestId: REQ_1, note: `  ${'a'.repeat(1000)}  ` }],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.replyNotes?.[0].note).toHaveLength(1000);
    }

    const blank = submitBatchBodySchema.safeParse({
      requestIds: [REQ_1],
      replyNotes: [{ requestId: REQ_1, note: '   ' }],
    });
    expect(blank.success).toBe(false);

    const tooLong = submitBatchBodySchema.safeParse({
      requestIds: [REQ_1],
      replyNotes: [{ requestId: REQ_1, note: 'a'.repeat(1001) }],
    });
    expect(tooLong.success).toBe(false);
  });

  it('includes REPLY_NOTE_REQUIRED in submitResultSchema and batchItemSchema stopReason enums, and ticketRef/replyNoteRequired in queue/batch schemas', () => {
    expect(
      submitResultSchema.safeParse({
        requestId: REQ_1,
        outcome: 'STOPPED',
        stopReason: 'REPLY_NOTE_REQUIRED',
        reserveConfirmation: 'NOT_GIVEN',
      }).success,
    ).toBe(true);

    expect(
      batchItemSchema.safeParse({
        requestId: REQ_1,
        position: 1,
        outcome: 'STOPPED',
        stopReason: 'REPLY_NOTE_REQUIRED',
        leftReason: null,
        leftAt: null,
        requestState: 'AWAITING_SPEND_SUBMISSION',
        ticketRef: { id: TICKET_1, position: 1, itemCount: 2 },
      }).success,
    ).toBe(true);

    expect(
      queueItemSchema.safeParse({
        requestId: REQ_1,
        plan: null,
        softwareName: 'Figma',
        requester: { employeeId: HEAD, employeeCode: 'E-1', fullName: 'Head' },
        beneficiary: { employeeId: HEAD, employeeCode: 'E-1', fullName: 'Head' },
        lineCount: 1,
        amount: null,
        budgetYear: 2026,
        stage: 'NOT_SUBMITTED',
        budgetOutcome: null,
        blockedReasons: [],
        overBy: null,
        readyToSubmit: false,
        updatedAt: '2026-06-01T00:00:00.000Z',
        queuedAt: '2026-06-01T00:00:00.000Z',
        waitedWorkingDays: 0,
        overdue: false,
        reminders: 0,
        ticketRef: null,
        replyNoteRequired: true,
      }).success,
    ).toBe(true);
  });
});
