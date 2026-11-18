/** The storage says there is no such object (S3 404 NotFound or NoSuchKey). */
export function isObjectMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number }; status?: number };
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.code === 'NotFound' ||
    candidate.code === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.status === 404
  );
}

/** The storage says the object was put again since it was looked at (S3 412 PreconditionFailed). */
export function isObjectChanged(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number }; status?: number };
  return (
    candidate.name === 'PreconditionFailed' ||
    candidate.code === 'PreconditionFailed' ||
    candidate.$metadata?.httpStatusCode === 412 ||
    candidate.status === 412
  );
}
