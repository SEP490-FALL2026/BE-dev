import { toCatalogApplicationWire } from './catalog-application.mapper';

describe('toCatalogApplicationWire', () => {
  const record = {
    id: '4f24d10d-63ad-49b1-a7a1-c988765990ae',
    slug: 'figma',
    name: 'Figma',
    vendor: 'Figma Inc.',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-12T10:00:00.000Z'),
  };

  it('converts the timestamp to an ISO string', () => {
    expect(toCatalogApplicationWire(record).createdAt).toBe('2026-08-12T10:00:00.000Z');
  });

  it('exposes exactly the documented fields', () => {
    expect(Object.keys(toCatalogApplicationWire(record)).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'slug',
      'status',
      'vendor',
    ]);
  });

  it('does not leak fields the record happens to carry', () => {
    // Prisma returns the whole row and TypeScript's structural typing accepts the extra
    // properties, so only an explicit field-by-field mapper stops an internal column from
    // reaching the client. This is the assertion that earns the mapper its existence.
    const withInternals = { ...record, updatedAt: new Date(), internalNote: 'do not ship' };

    expect(toCatalogApplicationWire(withInternals)).not.toHaveProperty('updatedAt');
    expect(toCatalogApplicationWire(withInternals)).not.toHaveProperty('internalNote');
  });
});
