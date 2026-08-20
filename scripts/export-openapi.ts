import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format } from 'prettier';
import { AppModule } from '../src/app.module';
import { configureApplication, createOpenApiDocument } from '../src/bootstrap';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApplication(app);
  const document = createOpenApiDocument(app);

  const serializedDocument = await format(JSON.stringify(document), {
    parser: 'json',
  });

  await writeFile(resolve(process.cwd(), 'openapi.json'), serializedDocument, 'utf8');
  await app.close();
}

void exportOpenApi().catch((error: unknown) => {
  console.error('OpenAPI export failed', error);
  process.exitCode = 1;
});
