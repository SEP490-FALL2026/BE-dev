import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication, createOpenApiDocument } from '../../src/bootstrap';
import { findOpenApi30Violations } from '../../src/infrastructure/http/openapi-dialect';
import {
  clientShape,
  routeDtos,
  runtimeContractOf,
  shapeDifferences,
  type RefResolver,
  type RouteDtos,
} from '../support/openapi-semantics';

type Json = Record<string, unknown>;
type Parameter = { name: string; in: string; required?: boolean; schema?: unknown };
type Operation = {
  operationId?: string;
  parameters?: Parameter[];
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const COMPONENT = '#/components/schemas/';

/**
 * OPENAPI-EXAMPLE.1-F3: the document the API serves and exports is one coherent OpenAPI 3.0 document, and every DTO in it
 * says what the route really validates or serializes. Checked on the in-process document, so a dependency upgrade that
 * changes the generated JSON Schema fails here even when the focused transformer tests still pass.
 */
describe('OpenAPI dialect and runtime contract (e2e)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;
  let schemas: Json;
  let resolveDocument: RefResolver;
  let operations: Map<string, Operation>;
  let routes: RouteDtos[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, { mountDocs: false });
    await app.init();

    document = createOpenApiDocument(app);
    schemas = document.components?.schemas ?? {};
    resolveDocument = (ref) => schemas[ref.replace(COMPONENT, '')];
    operations = new Map(
      Object.values(document.paths).flatMap((item) =>
        HTTP_METHODS.flatMap((method) => {
          const operation = (item as Record<string, Operation | undefined>)[method];
          return operation?.operationId ? [[operation.operationId, operation] as const] : [];
        }),
      ),
    );
    routes = routeDtos(app).filter((route) => route.operationId !== undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it('declares OpenAPI 3.0 and uses only OpenAPI 3.0 schema fields, at every schema position', () => {
    expect(document.openapi).toBe('3.0.0');
    expect(findOpenApi30Violations(document)).toEqual([]);
  });

  it('describes every request body, query, path and response DTO exactly as the runtime contract (Zod) does', () => {
    const problems: string[] = [];
    const comparedComponents = new Set<string>();
    const compareComponent = (name: string, schema: RouteDtos['responses'][number]['dto']['schema'], at: string) => {
      if (comparedComponents.has(name)) return;
      comparedComponents.add(name);
      const contract = runtimeContractOf(schema);
      if (!(name in schemas)) {
        problems.push(`${at}: component ${name} is missing`);
        return;
      }
      problems.push(
        ...shapeDifferences(
          clientShape(contract.schema, contract.resolve),
          clientShape(schemas[name], resolveDocument),
          `${COMPONENT}${name}`,
        ),
      );
    };
    /** Each field of a DTO against the matching property or parameter of the document, with its required flag. */
    const compareFields = (
      dto: NonNullable<RouteDtos['body']>,
      at: string,
      documented: Map<string, { required: boolean; schema: unknown }>,
      extraAllowed: ReadonlySet<string> = new Set(),
    ) => {
      const contract = runtimeContractOf(dto.schema);
      const properties = (contract.schema.properties ?? {}) as Json;
      const required = new Set((contract.schema.required ?? []) as string[]);
      for (const [name, property] of Object.entries(properties)) {
        const field = documented.get(name);
        if (!field) {
          problems.push(`${at} ${name}: missing`);
          continue;
        }
        if (field.required !== required.has(name))
          problems.push(
            `${at} ${name}: required ${field.required} where the runtime contract says ${required.has(name)}`,
          );
        problems.push(
          ...shapeDifferences(
            clientShape(property, contract.resolve),
            clientShape(field.schema, resolveDocument),
            `${at} ${name}`,
          ),
        );
      }
      for (const name of documented.keys())
        if (!(name in properties) && !extraAllowed.has(name)) problems.push(`${at} ${name}: not in ${dto.name}`);
    };

    for (const route of routes) {
      const operation = operations.get(route.operationId as string);
      if (!operation) {
        problems.push(`${route.handler}: operation ${route.operationId} is not in the document`);
        continue;
      }
      const content = operation.requestBody?.content ?? {};
      if (route.body && content['multipart/form-data']) {
        // An upload: the form is declared inline; the DTO validates the fields next to the file part.
        const form = content['multipart/form-data'].schema as { properties?: Json; required?: string[] };
        const fields = new Map(
          Object.entries(form.properties ?? {}).map(([name, schema]) => [
            name,
            { required: (form.required ?? []).includes(name), schema },
          ]),
        );
        compareFields(route.body, `${route.operationId} multipart field`, fields, new Set(['file']));
      } else if (route.body) {
        const schema = content['application/json']?.schema;
        if (JSON.stringify(schema) !== JSON.stringify({ $ref: `${COMPONENT}${route.body.name}` }))
          problems.push(`${route.handler}: request body does not reference ${route.body.name}`);
        compareComponent(route.body.name, route.body.schema, route.handler);
      }
      for (const { status, dto } of route.responses) {
        const schema = JSON.stringify(operation.responses?.[status]?.content?.['application/json']?.schema ?? null);
        if (!schema.includes(`"${COMPONENT}${dto.name}"`))
          problems.push(`${route.handler}: ${status} response does not reference ${dto.name}`);
        compareComponent(dto.name, dto.schema, `${route.handler} ${status}`);
      }
      for (const [location, dto] of [
        ['query', route.query],
        ['path', route.params],
      ] as const) {
        if (!dto) continue;
        const declared = (operation.parameters ?? []).filter((parameter) => parameter.in === location);
        const fields = new Map(
          declared.map((parameter) => [
            parameter.name,
            { required: parameter.required === true, schema: parameter.schema },
          ]),
        );
        compareFields(dto, `${route.operationId} ${location} parameter`, fields);
      }
    }

    expect(problems).toEqual([]);
  });

  it('compares a meaningful share of the document: every operation, and the components the routes use', () => {
    const operationIds = [...operations.keys()].sort();
    const routeIds = routes.map((route) => route.operationId as string).sort();
    const compared = new Set(
      routes.flatMap((route) => [route.body?.name, ...route.responses.map(({ dto }) => dto.name)]).filter(Boolean),
    );

    expect(routeIds).toEqual(operationIds);
    // Each component is a DTO some route uses, so it was compared above with its runtime schema.
    expect(Object.keys(schemas).filter((name) => !compared.has(name))).toEqual([]);
  });

  it('documents the four request fields Zod 4.6 had turned into arrays as nullable strings again', () => {
    const field = (component: string, property: string) =>
      ((schemas[component] as { properties: Json }).properties[property] as Json) ?? {};

    for (const [component, property] of [
      ['UpdateSubscriptionBodyDto', 'endDate'],
      ['UpdateSubscriptionBodyDto', 'renewalDate'],
      ['UpdateSubscriptionBodyDto', 'noticeDeadline'],
      ['PlanTermsBodyDto', 'lastReviewedOn'],
    ]) {
      expect({ component, property, schema: field(component, property) }).toEqual({
        component,
        property,
        schema: { type: 'string', nullable: true },
      });
    }
  });

  it('names a reintroduced mixed-dialect schema by its JSON pointer and reason', () => {
    const broken = structuredClone(document) as unknown as { components: { schemas: Record<string, Json> } };
    const employee = broken.components.schemas.EmployeeResponseDto as { properties: { data: { properties: Json } } };
    employee.properties.data.properties.workEmail = { type: ['string', 'null'] };
    const audit = broken.components.schemas.AuditEventPageResponseDto as {
      properties: { data: { properties: { items: { items: { properties: Json } } } } };
    };
    audit.properties.data.properties.items.items.properties.before = {
      type: 'object',
      propertyNames: { type: 'string' },
      additionalProperties: {},
      nullable: true,
    };

    expect(findOpenApi30Violations(broken)).toEqual([
      {
        pointer:
          '#/components/schemas/AuditEventPageResponseDto/properties/data/properties/items/items/properties/before/propertyNames',
        reason: 'propertyNames is not an OpenAPI 3.0 schema field',
      },
      {
        pointer: '#/components/schemas/EmployeeResponseDto/properties/data/properties/workEmail/type',
        reason: 'type must be one string in OpenAPI 3.0, found ["string","null"]',
      },
    ]);
  });
});
