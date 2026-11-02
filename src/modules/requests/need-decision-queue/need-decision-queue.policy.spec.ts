import {
  HELD_ROUTING_ROWS,
  planLineRequiredOf,
  reasonExcerptOf,
  REASON_EXCERPT_LENGTH,
  termConfirmationRequiredOf,
} from './need-decision-queue.policy';

describe('the rows of the routing table that put a step in a queue', () => {
  it('are the ones that give the step to a person, never row 8, which gives it to nobody', () => {
    expect([...HELD_ROUTING_ROWS]).toEqual([1, 2, 5, 9]);
    // Row 8 gives the step to nobody; rows 3 and 4 are a legacy step, frozen until the conversion, and never in a queue.
    for (const row of [3, 4, 8]) expect(HELD_ROUTING_ROWS).not.toContain(row);
  });
});

describe('the excerpt of the reason of a request', () => {
  it('keeps a short reason as it is, trimmed', () => {
    expect(reasonExcerptOf('  The project needs a wiki  ')).toBe('The project needs a wiki');
  });

  it('cuts a long reason by characters and says it was cut', () => {
    const excerpt = reasonExcerptOf('đ'.repeat(REASON_EXCERPT_LENGTH + 50));

    expect(excerpt).toBe(`${'đ'.repeat(REASON_EXCERPT_LENGTH)}…`);
  });

  it('keeps a reason of exactly the longest length whole', () => {
    expect(reasonExcerptOf('a'.repeat(REASON_EXCERPT_LENGTH))).toBe('a'.repeat(REASON_EXCERPT_LENGTH));
  });
});

describe('a term that has to be confirmed in so many words', () => {
  it.each([
    [12, null, false],
    [13, null, true],
    // A renewal is long when the right runs on for more than twelve months in all, not when its own term is.
    [3, { consecutiveMonths: 18 }, true],
    [24, { consecutiveMonths: 12 }, false],
  ])('a term of %i months with the renewal %j needs it: %s', (termMonths, renewal, expected) => {
    expect(termConfirmationRequiredOf({ termMonths, renewal })).toBe(expected);
  });
});

describe('the line of the plan of the budget the person chooses on approving', () => {
  const paid = { chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'] as ('NEED' | 'SPEND_APPROVAL' | 'IT_EXECUTION')[] };
  const free = { chain: ['NEED', 'IT_EXECUTION'] as ('NEED' | 'IT_EXECUTION')[] };

  it('is chosen by the head of a request that has a spend step', () => {
    expect(planLineRequiredOf('MANAGER', paid)).toBe(true);
  });

  it('is not chosen for free software, nor by the spending approver', () => {
    expect(planLineRequiredOf('MANAGER', free)).toBe(false);
    expect(planLineRequiredOf('SPENDING_APPROVER', paid)).toBe(false);
  });
});
