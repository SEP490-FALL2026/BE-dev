/**
 * Business error, deliberately framework-free. The repository throws this instead of an
 * HTTP exception so it stays unaware that HTTP exists; the facade maps it to the wire.
 */
export class ApplicationSlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`Catalog application slug already exists: ${slug}`);
    this.name = 'ApplicationSlugTakenError';
  }
}
