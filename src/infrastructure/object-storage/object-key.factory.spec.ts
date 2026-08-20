import { ObjectKeyFactory } from './object-key.factory';

describe('ObjectKeyFactory', () => {
  it('creates a deterministic scoped key that carries no caller-supplied text', () => {
    const factory = new ObjectKeyFactory(
      () => new Date('2026-08-12T10:00:00.000Z'),
      () => '4f24d10d-63ad-49b1-a7a1-c988765990ae',
    );

    const key = factory.create('imports');

    expect(key).toBe('imports/2026/08/4f24d10d-63ad-49b1-a7a1-c988765990ae');
  });

  it('rejects an unsafe scope', () => {
    const factory = new ObjectKeyFactory();

    expect(() => factory.create('../private')).toThrow('Invalid object storage scope');
  });
});
