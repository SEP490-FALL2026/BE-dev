import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CatalogApplicationRecord, CatalogApplicationStatus } from './catalog.types';
import { ApplicationSlugTakenError } from './errors/catalog.errors';

interface FindPageInput {
  page: number;
  pageSize: number;
  status?: CatalogApplicationStatus;
  /** Test-only isolation hook so an integration run cannot see rows it did not create. */
  slugPrefix?: string;
}

interface CreateInput {
  slug: string;
  name: string;
  vendor: string;
}

/** Prisma's unique-constraint violation. */
function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * The only file in this module allowed to inject PrismaService, and it may touch only the
 * `catalogApplication` delegate that `catalog` owns. Both rules are enforced by
 * `src/architecture-boundaries.spec.ts`.
 */
@Injectable()
export class CatalogRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(input: FindPageInput): Promise<{ rows: CatalogApplicationRecord[]; totalItems: number }> {
    const where = {
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.slugPrefix === undefined ? {} : { slug: { startsWith: input.slugPrefix } }),
    };

    // One transaction so the page and the count read the same snapshot; otherwise a
    // concurrent insert makes totalItems disagree with the rows just returned.
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.catalogApplication.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.catalogApplication.count({ where }),
    ]);

    return { rows, totalItems };
  }

  findById(id: string): Promise<CatalogApplicationRecord | null> {
    return this.prisma.catalogApplication.findUnique({ where: { id } });
  }

  async create(input: CreateInput): Promise<CatalogApplicationRecord> {
    try {
      return await this.prisma.catalogApplication.create({ data: input });
    } catch (error) {
      // Rely on the unique index rather than checking first and inserting after:
      // check-then-insert races, a unique constraint does not.
      if (isUniqueConstraintViolation(error)) {
        throw new ApplicationSlugTakenError(input.slug);
      }

      throw error;
    }
  }
}
