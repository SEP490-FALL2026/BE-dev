import { CatalogApplicationRecord, CatalogApplicationWire } from '../catalog.types';

/**
 * One place decides what leaves the module. Never return a Prisma model directly: it would
 * leak internal columns and turn a schema change into a breaking API change.
 */
export function toCatalogApplicationWire(record: CatalogApplicationRecord): CatalogApplicationWire {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    vendor: record.vendor,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}
