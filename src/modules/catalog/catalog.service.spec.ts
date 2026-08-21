import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { CatalogRepo } from './catalog.repo';
import { CatalogService } from './catalog.service';
import { ApplicationSlugTakenError } from './errors/catalog.errors';

const RECORD = {
  id: '4f24d10d-63ad-49b1-a7a1-c988765990ae',
  slug: 'figma',
  name: 'Figma',
  vendor: 'Figma Inc.',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-08-12T10:00:00.000Z'),
};

function serviceWith(repo: Partial<CatalogRepo>): CatalogService {
  return new CatalogService(repo as CatalogRepo);
}

describe('CatalogService', () => {
  it('maps records and computes the page metadata', async () => {
    const findPage = jest.fn().mockResolvedValue({ rows: [RECORD], totalItems: 5 });

    await expect(serviceWith({ findPage }).listApplications({ page: 2, pageSize: 2 })).resolves.toEqual({
      items: [{ ...RECORD, createdAt: '2026-08-12T10:00:00.000Z' }],
      pagination: { page: 2, pageSize: 2, totalItems: 5, totalPages: 3 },
    });
    expect(findPage).toHaveBeenCalledWith({ page: 2, pageSize: 2, status: undefined });
  });

  it('reports zero pages for an empty result instead of one empty page', async () => {
    const findPage = jest.fn().mockResolvedValue({ rows: [], totalItems: 0 });

    await expect(serviceWith({ findPage }).listApplications({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      pagination: { totalItems: 0, totalPages: 0 },
    });
  });

  it('passes a status filter through to the repository', async () => {
    const findPage = jest.fn().mockResolvedValue({ rows: [], totalItems: 0 });

    await serviceWith({ findPage }).listApplications({ page: 1, pageSize: 20, status: 'UNDER_REVIEW' });

    expect(findPage).toHaveBeenCalledWith({ page: 1, pageSize: 20, status: 'UNDER_REVIEW' });
  });

  it('rejects a page size the shared guard refuses', async () => {
    await expect(
      serviceWith({ findPage: jest.fn() }).listApplications({ page: 1, pageSize: Number.NaN }),
    ).rejects.toThrow('Page size must be positive');
  });

  it('translates a duplicate slug into a 409 with a stable code', async () => {
    const create = jest.fn().mockRejectedValue(new ApplicationSlugTakenError('figma'));
    const rejection = serviceWith({ create }).createApplication({
      slug: 'figma',
      name: 'Figma',
      vendor: 'Figma Inc.',
    });

    await expect(rejection).rejects.toBeInstanceOf(ApiException);
    await expect(rejection).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'CATALOG.APPLICATION_SLUG_TAKEN', details: { slug: 'figma' } },
    });
  });

  it('does not swallow an unexpected repository failure', async () => {
    // A catch that turned every error into a 409 would hide a real outage behind a
    // business error code the caller would keep retrying against.
    const failure = new Error('connection reset');
    const create = jest.fn().mockRejectedValue(failure);

    await expect(
      serviceWith({ create }).createApplication({ slug: 'figma', name: 'Figma', vendor: 'Figma Inc.' }),
    ).rejects.toBe(failure);
  });

  it('returns the created application on the wire shape', async () => {
    const create = jest.fn().mockResolvedValue(RECORD);

    await expect(
      serviceWith({ create }).createApplication({ slug: 'figma', name: 'Figma', vendor: 'Figma Inc.' }),
    ).resolves.toEqual({ ...RECORD, createdAt: '2026-08-12T10:00:00.000Z' });
  });

  it('raises a 404 with a stable code for an unknown application', async () => {
    const findById = jest.fn().mockResolvedValue(null);
    const rejection = serviceWith({ findById }).getApplication('4f24d10d-63ad-49b1-a7a1-c988765990ae');

    await expect(rejection).rejects.toBeInstanceOf(ApiException);
    await expect(rejection).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { code: 'CATALOG.APPLICATION_NOT_FOUND' },
    });
  });

  it('returns a known application', async () => {
    const findById = jest.fn().mockResolvedValue(RECORD);

    await expect(serviceWith({ findById }).getApplication(RECORD.id)).resolves.toMatchObject({ id: RECORD.id });
  });
});
