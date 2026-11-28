import type { TermRefusal } from '../../../core/term-limit';
import {
  ticketDecideBodySchema,
  ticketItemReasonSchema,
  ticketNeedResultSchema,
  ticketSpendResultSchema,
  ticketSubmitBodySchema,
  ticketWithdrawBodySchema,
  ticketWithdrawResultSchema,
} from './request-ticket.dto';

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const UUID_3 = '33333333-3333-4333-8333-333333333333';
const UUID_4 = '44444444-4444-4444-8444-444444444444';
const UUID_5 = '55555555-5555-4555-8555-555555555555';
const UUID_6 = '66666666-6666-4666-8666-666666666666';
const UUID_7 = '77777777-7777-4777-8777-777777777777';

const makeItem = (index = 0) => ({
  planId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  businessReason: `Need license ${index + 1}`,
});

const ALL_TERM_REFUSALS: readonly TermRefusal[] = [
  'TERM_REQUIRED',
  'TERM_MONTHS_OUT_OF_RANGE',
  'TERM_NOT_ASKED',
  'TERM_LONG_TERM_NOT_ALLOWED',
  'TERM_CONTRACT_ENDED',
  'K1_ANNUAL_TERM_FIXED',
  'K1_ANNUAL_CONTRACT_TOO_SHORT',
];

describe('request-ticket.dto', () => {
  describe('ticketSubmitBodySchema', () => {
    it('accepts 1, 6, 7, and 20 valid items (7..20 are handled by service TOO_MANY_ITEMS)', () => {
      for (const count of [1, 6, 7, 20]) {
        const result = ticketSubmitBodySchema.safeParse({
          items: Array.from({ length: count }, (_, index) => makeItem(index)),
        });

        expect(result.success).toBe(true);
      }
    });

    it('rejects 0 items and 21 items with Zod validation error', () => {
      expect(ticketSubmitBodySchema.safeParse({ items: [] }).success).toBe(false);
      expect(
        ticketSubmitBodySchema.safeParse({
          items: Array.from({ length: 21 }, (_, index) => makeItem(index)),
        }).success,
      ).toBe(false);
    });

    it('reports path items.1.businessReason when item 2 has blank businessReason (§7.2 C)', () => {
      const result = ticketSubmitBodySchema.safeParse({
        items: [makeItem(0), { planId: UUID_2, businessReason: '  ' }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('items.1.businessReason');
      }
    });
  });

  describe('ticketDecideBodySchema (Trọng tâm 4)', () => {
    const checklist = {
      policyVersionId: UUID_1,
      answers: [{ itemCode: 'NEED_1', answer: 'YES' as const }],
    };

    it('accepts 1 to 6 unique requestIds', () => {
      const parsed = ticketDecideBodySchema.safeParse({
        requestIds: [UUID_1, UUID_2],
        decision: 'APPROVE',
        checklist,
      });

      expect(parsed.success).toBe(true);
    });

    it.each([
      { name: 'empty requestIds', requestIds: [] },
      { name: 'duplicate requestIds', requestIds: [UUID_1, UUID_1] },
      {
        name: '7 requestIds (> MAX_TICKET_ITEMS)',
        requestIds: [UUID_1, UUID_2, UUID_3, UUID_4, UUID_5, UUID_6, UUID_7],
      },
    ])('rejects $name', ({ requestIds }) => {
      const parsed = ticketDecideBodySchema.safeParse({
        requestIds,
        decision: 'APPROVE',
        checklist,
      });

      expect(parsed.success).toBe(false);
    });
  });

  describe('ticketWithdrawBodySchema', () => {
    it('accepts omitted or trimmed reason up to 1000 chars and rejects blank or >1000 chars', () => {
      expect(ticketWithdrawBodySchema.safeParse({}).success).toBe(true);
      expect(ticketWithdrawBodySchema.safeParse({ reason: 'No longer needed' }).success).toBe(true);
      expect(ticketWithdrawBodySchema.safeParse({ reason: 'a'.repeat(1000) }).success).toBe(true);
      expect(ticketWithdrawBodySchema.safeParse({ reason: '   ' }).success).toBe(false);
      expect(ticketWithdrawBodySchema.safeParse({ reason: 'a'.repeat(1001) }).success).toBe(false);
    });
  });

  describe('ticketItemReasonSchema (§8.3)', () => {
    it('contains exactly 16 closed values including all 7 TermRefusal values', () => {
      expect(ticketItemReasonSchema.options).toHaveLength(16);
      expect(new Set(ticketItemReasonSchema.options).size).toBe(16);
      for (const refusal of ALL_TERM_REFUSALS) {
        expect(ticketItemReasonSchema.options).toContain(refusal);
      }
      expect(ticketItemReasonSchema.options).toEqual([
        'PLAN_NOT_FOUND',
        'APPLICATION_RETIRED',
        'PLAN_BOUND_TO_DEVICE',
        'NOT_PRICEABLE',
        'NOT_PAID_IN_CATALOG',
        'HAS_ACCESS',
        ...ALL_TERM_REFUSALS,
        'HAS_OPEN_REQUEST',
        'DUPLICATE_IN_TICKET',
        'OPEN_LIMIT_REACHED',
      ]);
    });
  });

  describe('ticket result enums (§8.3)', () => {
    it('matches closed result outcome and reason enums for #3, #4, #5', () => {
      expect(ticketNeedResultSchema.shape.outcome.options).toEqual([
        'APPROVED',
        'REJECTED',
        'RETURNED',
        'SKIPPED',
        'RETRYABLE',
      ]);
      expect(ticketNeedResultSchema.shape.reason.unwrap().options).toEqual([
        'NOT_IN_TICKET',
        'OWN_REQUEST',
        'NOT_THE_ASSIGNEE',
        'STEP_NOT_PENDING',
        'ALREADY_DECIDED',
        'TRANSIENT_FAILURE',
      ]);
      expect(ticketSpendResultSchema.shape.outcome.options).toEqual([
        'APPROVED',
        'REJECTED',
        'RETURNED',
        'SKIPPED',
        'RETRYABLE',
      ]);
      expect(ticketSpendResultSchema.shape.reason.unwrap().options).toEqual([
        'NOT_IN_TICKET',
        'USE_BATCH',
        'NO_SPEND_STEP',
        'NOT_THE_ASSIGNEE',
        'OWN_REQUEST',
        'NOT_CHECKABLE',
        'RECHECKED_RETURNED_TO_REQUESTER',
        'COMMITMENT_NOT_HOLDABLE',
        'ALREADY_DECIDED',
        'TRANSIENT_FAILURE',
      ]);
      expect(ticketWithdrawResultSchema.shape.outcome.options).toEqual(['WITHDRAWN', 'SKIPPED', 'RETRYABLE']);
      expect(ticketWithdrawResultSchema.shape.reason.unwrap().options).toEqual([
        'WITHDRAWAL_AFTER_DECISION',
        'ALREADY_ENDED',
        'WITHDRAWAL_PENDING',
        'GRANT_RUNNING',
        'GRANT_COMPLETED',
        'ALREADY_WITHDRAWN',
        'NOT_IN_TICKET',
        'TRANSIENT_FAILURE',
      ]);
    });
  });
});
