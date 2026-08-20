import { normalizePageSize } from './pagination';

describe('normalizePageSize', () => {
  it('uses the default when no size is requested', () => {
    expect(normalizePageSize(undefined)).toBe(20);
  });

  it('caps an excessive size', () => {
    expect(normalizePageSize(1_000)).toBe(100);
  });

  it('rejects non-positive values', () => {
    expect(() => normalizePageSize(0)).toThrow('Page size must be positive');
  });
});
