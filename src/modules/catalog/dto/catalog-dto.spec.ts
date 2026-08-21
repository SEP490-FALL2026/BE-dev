import { applicationIdParamSchema } from './application-id.dto';
import { createApplicationBodySchema } from './create-application.dto';
import { listApplicationsQuerySchema } from './list-applications.dto';

describe('catalog request contracts', () => {
  it('coerces numeric query strings and applies defaults', () => {
    expect(listApplicationsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(listApplicationsQuerySchema.parse({ page: '3', pageSize: '50' })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
  });

  it('rejects an unknown query parameter instead of ignoring it', () => {
    // A silently dropped `?sort=name` lets a caller believe it worked. Failing loudly is
    // the only way they find out it did nothing.
    expect(listApplicationsQuerySchema.safeParse({ pageSize: '10', sort: 'name' }).success).toBe(false);
  });

  it('rejects a page size above the documented maximum', () => {
    expect(listApplicationsQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  it('accepts a documented status filter', () => {
    expect(listApplicationsQuerySchema.parse({ status: 'UNDER_REVIEW' })).toMatchObject({ status: 'UNDER_REVIEW' });
    expect(listApplicationsQuerySchema.safeParse({ status: 'RETIRED' }).success).toBe(false);
  });

  it('trims and bounds the create body', () => {
    expect(createApplicationBodySchema.parse({ slug: 'figma', name: '  Figma  ', vendor: 'Figma Inc.' })).toEqual({
      slug: 'figma',
      name: 'Figma',
      vendor: 'Figma Inc.',
    });
  });

  it('rejects a slug that is not lowercase kebab-case', () => {
    for (const slug of ['Figma', 'fig ma', '-figma', 'figma!', '', '1figma']) {
      expect(createApplicationBodySchema.safeParse({ slug, name: 'Figma', vendor: 'Figma Inc.' }).success).toBe(false);
    }
  });

  it('refuses a client-supplied id or timestamp', () => {
    const withServerOwnedFields = {
      slug: 'figma',
      name: 'Figma',
      vendor: 'Figma Inc.',
      id: '4f24d10d-63ad-49b1-a7a1-c988765990ae',
      createdAt: '2026-08-12T10:00:00.000Z',
    };

    expect(createApplicationBodySchema.safeParse(withServerOwnedFields).success).toBe(false);
  });

  it('validates the route identifier as a UUID', () => {
    const id = '4f24d10d-63ad-49b1-a7a1-c988765990ae';

    expect(applicationIdParamSchema.parse({ id })).toEqual({ id });
    expect(applicationIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(applicationIdParamSchema.safeParse({ id: 42 }).success).toBe(false);
  });
});
