import { isBlockInForce } from './access-block.policy';

describe('isBlockInForce', () => {
  it('reads a block in force by its first day only', () => {
    expect(isBlockInForce(null, '2026-11-10')).toBe(false);
    expect(isBlockInForce({ blockedFrom: '2026-11-11' }, '2026-11-10')).toBe(false);
    expect(isBlockInForce({ blockedFrom: '2026-11-10' }, '2026-11-10')).toBe(true);
  });
});
