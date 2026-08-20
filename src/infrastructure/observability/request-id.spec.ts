import { resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('keeps a safe caller-provided identifier', () => {
    expect(resolveRequestId('web-01J_SAFE.request')).toBe('web-01J_SAFE.request');
  });

  it.each(['unsafe request', 'line\nbreak', 'x'.repeat(129)])('replaces an unsafe identifier: %s', (provided) => {
    expect(resolveRequestId(provided)).not.toBe(provided);
  });
});
