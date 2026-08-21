/**
 * Stable, machine-readable error codes. The frontend branches on these, never on
 * `message`, so renaming one is a breaking API change.
 */
export const CATALOG_ERROR_CODES = {
  applicationSlugTaken: 'CATALOG.APPLICATION_SLUG_TAKEN',
  applicationNotFound: 'CATALOG.APPLICATION_NOT_FOUND',
} as const;
