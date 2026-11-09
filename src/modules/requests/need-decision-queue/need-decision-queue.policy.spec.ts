import { HELD_ROUTING_ROWS, reasonExcerptOf, REASON_EXCERPT_LENGTH } from './need-decision-queue.policy';

describe('the rows of the routing table that put a step in a queue', () => {
  it('are the ones that give the step to a person, never row 8, which gives it to nobody', () => {
    expect([...HELD_ROUTING_ROWS]).toEqual([1, 2, 5, 9]);
    // Row 8 gives the step to nobody; rows 3 and 4 are not written any more, and none is ever in a queue.
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
