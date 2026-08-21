import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { AppModule } from '../src/app.module';
import { configureApplication, createOpenApiDocument } from '../src/bootstrap';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
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
  await app.close();
}

void exportOpenApi().catch((error: unknown) => {
  console.error('OpenAPI export failed', error);
  process.exitCode = 1;
});
