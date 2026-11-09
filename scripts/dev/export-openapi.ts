import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { assertOpenApi30Dialect, OpenApiDialectError } from '../../src/infrastructure/http/openapi-dialect';
import { withExportOnlyEnvironment } from './export-environment';

const PROJECT_ROOT = resolve(__dirname, '..', '..');

/** `ts-node scripts/dev/export-openapi.ts [output]`: writes the OpenAPI document (default: openapi.json at the root). */
async function exportOpenApi(outputPath: string): Promise<void> {
  // The document depends on the routes and API_PREFIX, never on a secret or a connection. The configuration module
  // validates when the graph is imported, so the graph is imported inside the export-only environment.
  const document = await withExportOnlyEnvironment(async () => {
    const { AppModule } = await import('../../src/app/app.module');
    const { configureApplication, createOpenApiDocument } = await import('../../src/app/configure-application');

    // abortOnError: false — by default Nest calls process.exit on a start-up error, which would skip the `finally`
    // that restores the environment and removes the temporary folder, and the one-line message below.
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    try {
      configureApplication(app, { mountDocs: false });
      return createOpenApiDocument(app);
    } finally {
      await app.close();
    }
  });

  // OPENAPI-EXAMPLE.1-F3: a document client generators would refuse (a JSON Schema 2020-12 shape in an OpenAPI 3.0
  // document) is never written; each offending pointer is printed instead.
  assertOpenApi30Dialect(document);

  // `format` does not read .prettierrc on its own. Without resolving it first, the exported
  // document is formatted with Prettier's defaults while `pnpm check` verifies it against
  // the repository's — a mismatch that stays invisible until the document grows past the
  // configured print width, then fails the gate on a file nobody edited by hand.
  // Resolved for the repository's document, wherever the output goes, so every export is formatted the same way.
  const prettierOptions = await resolveConfig(join(PROJECT_ROOT, 'openapi.json'));
  const serializedDocument = await format(JSON.stringify(document), {
    ...prettierOptions,
    parser: 'json',
  });

  await writeFile(outputPath, serializedDocument, 'utf8');
}

void exportOpenApi(resolve(process.argv[2] ?? join(PROJECT_ROOT, 'openapi.json'))).catch((error: unknown) => {
  console.error('OpenAPI export failed', error instanceof Error ? error.name : 'unknown error');
  if (error instanceof OpenApiDialectError) {
    for (const violation of error.violations) console.error(`  ${violation.pointer}: ${violation.reason}`);
  }
  process.exitCode = 1;
});
