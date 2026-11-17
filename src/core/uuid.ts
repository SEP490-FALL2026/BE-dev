/** The shape PostgreSQL accepts for a `uuid` column (any version, any case); it is the database's check, not RFC 4122's. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The well-formed ids of a list, each once and in the order first seen. A query `WHERE id IN (…)` on a `uuid` column fails on the
 * whole statement when one value is not a uuid, so a caller that gets ids it did not mint filters them first.
 */
export function distinctUuids(ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => UUID.test(id));
}
