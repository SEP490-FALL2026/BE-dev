import { z } from 'zod';

/**
 * The exact `format` + `pattern` pairs the schema generator (Zod, which also validates these values at runtime) emits
 * for `z.uuid()` and `z.iso.datetime()`, with and without offset. Only these patterns merely repeat their format; any
 * other pattern — even next to a uuid or date-time format — is a rule of its own and stays in the document.
 */
const REDUNDANT_FORMAT_PATTERNS: ReadonlyArray<{ format: string; pattern: string }> = [
  z.uuid(),
  z.iso.datetime(),
  z.iso.datetime({ offset: true }),
].map((schema) => {
  const { format, pattern } = z.toJSONSchema(schema) as { format: string; pattern: string };
  return { format, pattern };
});

/** True only for a pattern the generator emits for exactly this format. When in doubt, the pattern is kept. */
export function isRedundantFormatPattern(format: unknown, pattern: unknown): boolean {
  return REDUNDANT_FORMAT_PATTERNS.some((known) => known.format === format && known.pattern === pattern);
}

/**
 * Presentation-only cleanup of the generated OpenAPI 3.0 document: `const` (an OpenAPI 3.1 keyword) becomes a
 * single-value `enum`, and a pattern that only repeats its uuid or date-time format is dropped. Runtime validation is
 * untouched. Returns a new document; the input is not modified.
 */
export function toOpenApi30Presentation<T>(document: T): T {
  return present(document) as T;
}

function present(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(present);
  if (node === null || typeof node !== 'object') return node;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) result[key] = present(value);

  if ('const' in result) {
    result.enum = [result.const];
    delete result.const;
  }
  if (isRedundantFormatPattern(result.format, result.pattern)) delete result.pattern;

  return result;
}
