import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

async function exportOpenApi(): Promise<void> {
  // The document depends on the routes and API_PREFIX, never on a secret. Since E3 = C (H6.3) only NODE_ENV=test has
  // public secret fallbacks, so the export runs as test: no developer or CI secret is needed, and nothing connects to
  // a database. The configuration module validates when it is imported, so the module graph is imported after this.
  process.env.NODE_ENV = 'test';
  const { AppModule } = await import('../../src/app.module');
  const { configureApplication, createOpenApiDocument } = await import('../../src/bootstrap');

  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    configureApplication(app, { mountDocs: false });
    const document = createOpenApiDocument(app);
    const outputPath = resolve(process.cwd(), 'openapi.json');

    // `format` does not read .prettierrc on its own. Without resolving it first, the exported
    // document is formatted with Prettier's defaults while `pnpm check` verifies it against
    // the repository's — a mismatch that stays invisible until the document grows past the
    // configured print width, then fails the gate on a file nobody edited by hand.
    const prettierOptions = await resolveConfig(outputPath);
    const serializedDocument = await format(JSON.stringify(document), {
      ...prettierOptions,
      parser: 'json',
    });

    await writeFile(outputPath, serializedDocument, 'utf8');
  } finally {
    await app.close();
  }
}

void exportOpenApi().catch((error: unknown) => {
  console.error('OpenAPI export failed', error);
  process.exitCode = 1;
});
