import { ObjectKeyFactory } from './object-key.factory';

describe('ObjectKeyFactory', () => {
  it('creates a deterministic scoped key without trusting the file name', () => {
    const factory = new ObjectKeyFactory(
      () => new Date('2026-08-12T10:00:00.000Z'),
      () => '4f24d10d-63ad-49b1-a7a1-c988765990ae',
    );

    const key = factory.create('imports', '../../payroll.xlsx');

    expect(key).toBe('imports/2026/08/4f24d10d-63ad-49b1-a7a1-c988765990ae');
    expect(key).not.toContain('payroll');
    expect(key).not.toContain('..');
  });

  it('rejects an unsafe scope', () => {
    const factory = new ObjectKeyFactory();

    expect(() => factory.create('../private', 'file.csv')).toThrow('Invalid object storage scope');
  });
});
