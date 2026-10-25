import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { cleanupOpenApiDoc, createZodDto as createNestjsZodDto } from 'nestjs-zod';
import * as ts from 'typescript';
import { z } from 'zod';
import { findOpenApi30Violations } from '../openapi-dialect';
import { toOpenApi30Presentation } from '../openapi-presentation';
import { createZodDto } from './zod-dto';

/** A refined string, as the date fields of the catalog DTOs are: no keyword of its own, so Zod emits a bare type. */
const businessDate = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), { message: 'Must be a date.' });
const thingSchema = z.strictObject({
  name: z.string(),
  note: z.string().nullable(),
  endDate: businessDate.nullable().optional(),
  either: z.union([z.string(), z.number()]),
  maybe: z.union([z.string(), z.number()]).nullable(),
  code: z.string().min(1).nullable(),
});

class ThingBodyDto extends createZodDto(thingSchema) {}
class LibraryThingBodyDto extends createNestjsZodDto(thingSchema) {}

@Controller('things')
class ThingController {
  @Post()
  create(@Body() body: ThingBodyDto): ThingBodyDto {
    return body;
  }

  @Post('library')
  createWithLibraryDto(@Body() body: LibraryThingBodyDto): LibraryThingBodyDto {
    return body;
  }
}

type PropertyMetadata = Record<string, { type?: unknown; anyOf?: unknown; required?: unknown }>;
const metadataOf = (dto: { _OPENAPI_METADATA_FACTORY(): unknown }) =>
  dto._OPENAPI_METADATA_FACTORY() as PropertyMetadata;

describe('createZodDto (the application DTO factory)', () => {
  let app: INestApplication;
  let schemas: Record<string, { properties: Record<string, unknown>; required?: string[] }>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ThingController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    const config = new DocumentBuilder().setOpenAPIVersion('3.0.0').build();
    const document = toOpenApi30Presentation(
      cleanupOpenApiDoc(SwaggerModule.createDocument(app, config), { version: '3.0' }),
    );
    schemas = document.components?.schemas as typeof schemas;
  });

  afterAll(async () => {
    await app.close();
  });

  it('hands Swagger no type array: a compact Zod union becomes the anyOf it stands for', () => {
    const metadata = metadataOf(ThingBodyDto);

    expect(Object.values(metadata).filter((property) => Array.isArray(property.type))).toEqual([]);
    expect(metadata.note).toMatchObject({ type: '', anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(metadata.either).toMatchObject({ type: '', anyOf: [{ type: 'string' }, { type: 'number' }] });
    // Untouched: a single type, and a union Zod already emits as anyOf.
    expect(metadata.name).toMatchObject({ type: 'string', required: true });
    expect(metadata.code).toMatchObject({ anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] });
  });

  it('documents a nullable top-level property as a nullable value, never as an array', () => {
    const { properties, required } = schemas.ThingBodyDto;

    expect(properties.note).toEqual({ type: 'string', nullable: true });
    expect(properties.endDate).toEqual({ type: 'string', nullable: true });
    expect(properties.either).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }] });
    expect(properties.maybe).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true });
    expect(properties.code).toEqual({ type: 'string', minLength: 1, nullable: true });
    expect([...(required ?? [])].sort()).toEqual(['code', 'either', 'maybe', 'name', 'note']);
    expect(
      findOpenApi30Violations({ openapi: '3.0.0', components: { schemas: { ThingBodyDto: schemas.ThingBodyDto } } }),
    ).toEqual([]);
  });

  it('is still needed: the library factory alone lets Swagger read a nullable string as an array (upgrade alarm)', () => {
    // When nestjs-zod or @nestjs/swagger stops doing this, this test fails: review whether the adapter can go.
    expect(Array.isArray(metadataOf(LibraryThingBodyDto).note.type)).toBe(true);
    expect(schemas.LibraryThingBodyDto.properties.note).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('keeps the runtime DTO: the same schema, validation and the output variant', () => {
    expect(ThingBodyDto.isZodDto).toBe(true);
    expect(ThingBodyDto.schema).toBe(thingSchema);
    expect(ThingBodyDto.create({ name: 'a', note: null, either: 1, maybe: null, code: null })).toEqual({
      name: 'a',
      note: null,
      either: 1,
      maybe: null,
      code: null,
    });
    expect(() => ThingBodyDto.create({ name: 'a', note: ['x'], either: 1, maybe: null, code: null })).toThrow();
    expect(Object.values(metadataOf(ThingBodyDto.Output)).filter((property) => Array.isArray(property.type))).toEqual(
      [],
    );
  });
});

/** Every DTO of the application is built by the adapter: a direct nestjs-zod import would bypass it silently. */
describe('DTO factory boundary (OPENAPI-EXAMPLE.1-F3)', () => {
  const sourceRoot = join(__dirname, '..', '..', '..');
  const adapter = join(__dirname, 'zod-dto.ts');

  function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return name === 'generated' ? [] : sourceFiles(path);
      return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });
  }

  function importsOfCreateZodDtoFromLibrary(file: string): boolean {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    return source.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === 'nestjs-zod' &&
        statement.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(statement.importClause.namedBindings) &&
        statement.importClause.namedBindings.elements.some(
          (element) => (element.propertyName ?? element.name).text === 'createZodDto',
        ),
    );
  }

  it('imports createZodDto from nestjs-zod only in the adapter', () => {
    const offenders = sourceFiles(sourceRoot)
      .filter((file) => file !== adapter && importsOfCreateZodDtoFromLibrary(file))
      .map((file) => relative(sourceRoot, file).split(sep).join('/'));

    expect(offenders).toEqual([]);
  });

  it('recognizes a renamed import as the library factory', () => {
    const probe = join(__dirname, 'zod-dto.ts');

    expect(importsOfCreateZodDtoFromLibrary(probe)).toBe(true);
  });
});
