import { requireExpressInstance } from './bootstrap';

describe('requireExpressInstance', () => {
  it('returns an instance that can be configured', () => {
    const instance = { set: jest.fn() };

    expect(requireExpressInstance(instance)).toBe(instance);
  });

  it('throws when the adapter cannot accept settings', () => {
    expect(() => requireExpressInstance({})).toThrow('Expected an Express HTTP adapter');
    expect(() => requireExpressInstance(null)).toThrow('Expected an Express HTTP adapter');
  });
});
