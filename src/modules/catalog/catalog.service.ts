import { HttpStatus, Injectable } from '@nestjs/common';
import { normalizePageSize } from '../../core/application/pagination';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { CATALOG_ERROR_CODES } from './catalog.constants';
import { CatalogRepo } from './catalog.repo';
import { CatalogApplicationPage, CatalogApplicationStatus, CatalogApplicationWire } from './catalog.types';
import { ApplicationSlugTakenError } from './errors/catalog.errors';
import { toCatalogApplicationWire } from './mappers/catalog-application.mapper';

interface ListApplicationsInput {
  page: number;
  pageSize: number;
  status?: CatalogApplicationStatus;
}

interface CreateApplicationInput {
  slug: string;
  name: string;
  vendor: string;
}

/**
 * Public contract of the catalog module. Other modules call this class and nothing else;
 * `CatalogRepo` stays private so no caller can reach the tables directly.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly repo: CatalogRepo) {}

  async listApplications(input: ListApplicationsInput): Promise<CatalogApplicationPage> {
    const pageSize = normalizePageSize(input.pageSize);
    const { rows, totalItems } = await this.repo.findPage({
      page: input.page,
      pageSize,
      status: input.status,
    });

    return {
      items: rows.map(toCatalogApplicationWire),
      pagination: {
        page: input.page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async getApplication(id: string): Promise<CatalogApplicationWire> {
    const record = await this.repo.findById(id);

    if (record === null) {
      throw new ApiException(HttpStatus.NOT_FOUND, {
        code: CATALOG_ERROR_CODES.applicationNotFound,
        message: 'The catalog application was not found.',
      });
    }

    return toCatalogApplicationWire(record);
  }

  async createApplication(input: CreateApplicationInput): Promise<CatalogApplicationWire> {
    try {
      return toCatalogApplicationWire(await this.repo.create(input));
    } catch (error) {
      // Translate only the error we understand. Anything else is a real failure and must
      // keep bubbling to the exception filter as a 500.
      if (error instanceof ApplicationSlugTakenError) {
        throw new ApiException(HttpStatus.CONFLICT, {
          code: CATALOG_ERROR_CODES.applicationSlugTaken,
          message: 'A catalog application with this slug already exists.',
          details: { slug: error.slug },
        });
      }

      throw error;
    }
  }
}
