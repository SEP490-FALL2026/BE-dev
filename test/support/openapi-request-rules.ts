import type { OpenAPIObject } from '@nestjs/swagger';
import type { z } from 'zod';
import { isBusinessDate } from '../../src/core/business-date';
import type { RouteDtos } from './openapi-semantics';

/**
 * Reads, from the Zod schema of a route and from the document, where a request says it is a business date (and, beside it, the other
 * rules the document states): the support of `test/http/platform/openapi-request-rules.http-spec.ts`. Nothing here asserts.
 */

export type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The part of a Zod 4 definition this reads: the kind, and what each kind holds. */
interface ZodDefinition {
  type: string;
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
  innerType?: z.ZodType;
  in?: z.ZodType;
  options?: z.ZodType[];
  valueType?: z.ZodType;
  left?: z.ZodType;
  right?: z.ZodType;
  checks?: { _zod: { def: { check?: string; fn?: unknown; tx?: unknown } } }[];
}
const definitionOf = (schema: z.ZodType): ZodDefinition =>
  (schema as unknown as { _zod: { def: ZodDefinition } })._zod.def;

/** True for a string whose rule is `isBusinessDate`, however the string is wrapped. */
function isBusinessDateString(definition: ZodDefinition): boolean {
  return (
    definition.type === 'string' &&
    (definition.checks ?? []).some((check) => check._zod.def.check === 'custom' && check._zod.def.fn === isBusinessDate)
  );
}

/**
 * What each string field of `schema` yields: the name of each property, `[]` for the items of an array, `{}` for the values of a map and
 * `|<n>` for the n-th option of a union form the path. A pipe is read on its input side, the one a client sends.
 */
function mapStrings<T>(
  schema: z.ZodType,
  path: string[],
  atString: (definition: ZodDefinition, path: string[]) => T[],
): T[] {
  const definition = definitionOf(schema);
  const below = (child: z.ZodType, step: string[]) => mapStrings(child, [...path, ...step], atString);

  switch (definition.type) {
    case 'string':
      return atString(definition, path);
    case 'object':
      return Object.entries(definition.shape ?? {}).flatMap(([name, child]) => below(child, [name]));
    case 'array':
      return definition.element ? below(definition.element, ['[]']) : [];
    case 'record':
      return definition.valueType ? below(definition.valueType, ['{}']) : [];
    case 'union':
      return (definition.options ?? []).flatMap((option, index) => below(option, [`|${index}`]));
    case 'pipe':
      return definition.in ? below(definition.in, []) : [];
    case 'intersection':
      return [
        ...(definition.left ? below(definition.left, []) : []),
        ...(definition.right ? below(definition.right, []) : []),
      ];
    default:
      return definition.innerType ? below(definition.innerType, []) : [];
  }
}

/** The path of every field of `schema` that is a business date (see `mapStrings` for the path). */
export function dateLeavesOf(schema: z.ZodType, path: string[] = []): string[][] {
  return mapStrings(schema, path, (definition, here) => (isBusinessDateString(definition) ? [here] : []));
}

/** A string field of a schema and what its checks do to the whitespace around the text. */
export interface StringLeaf {
  path: string[];
  /** The schema removes the leading and trailing whitespace (`.trim()`). */
  trims: boolean;
  /** It does so before any check of the text, so a length is measured on the trimmed text. */
  trimsBeforeChecks: boolean;
}

/** Whether a check of a string is the one `.trim()` adds: an overwrite that turns `" a "` into `"a"` (`.toLowerCase()` is another). */
const isTrim = (check: NonNullable<ZodDefinition['checks']>[number]): boolean => {
  const { check: kind, tx } = check._zod.def;

  return kind === 'overwrite' && typeof tx === 'function' && (tx as (value: string) => unknown)(' a ') === 'a';
};

/** Every string field of `schema`, with whether and where its schema trims it. */
export function stringLeavesOf(schema: z.ZodType, path: string[] = []): StringLeaf[] {
  return mapStrings(schema, path, (definition, here) => {
    const checks = definition.checks ?? [];
    const first = checks.findIndex(isTrim);

    return [
      {
        path: here,
        trims: first !== -1,
        trimsBeforeChecks:
          first !== -1 && checks.slice(0, first).every((check) => check._zod.def.check === 'overwrite'),
      },
    ];
  });
}

const refOf = (node: Json): string | undefined => (typeof node.$ref === 'string' ? node.$ref : undefined);

/** A node with its `$ref` followed and its `allOf` merged, so a property can be read off it. */
function settled(node: unknown, document: OpenAPIObject): Json | undefined {
  if (!isRecord(node)) return undefined;
  const ref = refOf(node);
  if (ref) return settled((document.components?.schemas ?? {})[ref.replace('#/components/schemas/', '')], document);
  if (!Array.isArray(node.allOf)) return node;
  const { allOf, ...rest } = node;

  // The properties of the parts are added to each other (an overlay such as the success message names only its own).
  return (allOf as unknown[]).reduce<Json>((merged, part) => {
    const next = settled(part, document) ?? {};

    return {
      ...merged,
      ...next,
      ...(isRecord(merged.properties) || isRecord(next.properties)
        ? {
            properties: {
              ...(isRecord(merged.properties) ? merged.properties : {}),
              ...(isRecord(next.properties) ? next.properties : {}),
            },
          }
        : {}),
    };
  }, rest);
}

/** The node of the document at `path` (see `dateLeavesOf`) below `root`, or undefined when the document has none there. */
export function documentNodeOf(root: unknown, document: OpenAPIObject, path: readonly string[]): Json | undefined {
  let node = settled(root, document);
  for (const segment of path) {
    if (!node) return undefined;
    if (segment === '[]') node = settled(node.items, document);
    else if (segment === '{}') node = settled(node.additionalProperties, document);
    else if (segment.startsWith('|')) {
      const options = (node.oneOf ?? node.anyOf) as unknown[] | undefined;
      node = settled(options?.[Number(segment.slice(1))], document);
    } else node = settled(isRecord(node.properties) ? node.properties[segment] : undefined, document);
  }

  return node;
}

/** What `requestRoots` finds for one input of one route. */
export interface RequestRoot {
  operationId: string;
  input: 'Body' | 'Query' | 'Path' | `Response ${string}`;
  /** The schema of the route's DTO, and the node of the document that describes the same input (a query is made of its parameters). */
  schema: z.ZodType;
  root: unknown;
}

/** The inputs (body, query, path) of a route with the Zod schema each is validated by and the document node that describes it. */
export function requestRoots(document: OpenAPIObject, route: RouteDtos): RequestRoot[] {
  const operation = Object.values(document.paths)
    .flatMap((item) => Object.values(item as Record<string, unknown>))
    .find((candidate) => isRecord(candidate) && candidate.operationId === route.operationId) as Json | undefined;
  if (!operation || !route.operationId) return [];
  const operationId = route.operationId;
  const parameters = (Array.isArray(operation.parameters) ? operation.parameters : []) as Json[];
  const made: RequestRoot[] = [];

  if (route.body) {
    const content = (operation.requestBody as { content?: Record<string, { schema?: unknown }> } | undefined)?.content;
    made.push({ operationId, input: 'Body', schema: route.body.schema, root: content?.['application/json']?.schema });
  }
  for (const [dto, input, location] of [
    [route.query, 'Query', 'query'],
    [route.params, 'Path', 'path'],
  ] as const) {
    if (!dto) continue;
    // nestjs-zod keeps the description of a non-nullable parameter beside its schema, not in it: both are what the document says.
    const properties = Object.fromEntries(
      parameters
        .filter((parameter) => parameter.in === location)
        .map((parameter) => [
          parameter.name as string,
          {
            ...(isRecord(parameter.schema) ? parameter.schema : {}),
            ...(parameter.description ? { description: parameter.description } : {}),
          },
        ]),
    );
    made.push({ operationId, input, schema: dto.schema, root: { type: 'object', properties } });
  }

  return made;
}

/**
 * The declared responses of a route (the DTO of each status and the node of the document that describes it): what the route SAYS to
 * the caller, as `requestRoots` is what it asks of the caller.
 */
export function responseRoots(document: OpenAPIObject, route: RouteDtos): RequestRoot[] {
  const operation = Object.values(document.paths)
    .flatMap((item) => Object.values(item as Record<string, unknown>))
    .find((candidate) => isRecord(candidate) && candidate.operationId === route.operationId) as Json | undefined;
  if (!operation || !route.operationId) return [];
  const responses = (isRecord(operation.responses) ? operation.responses : {}) as Record<string, Json>;
  const operationId = route.operationId;

  return route.responses.map(({ status, dto }) => {
    const content = responses[status]?.content as Record<string, { schema?: unknown }> | undefined;

    return {
      operationId,
      input: `Response ${status}` as RequestRoot['input'],
      schema: dto.schema,
      root: content?.['application/json']?.schema,
    };
  });
}

/** `where` of every entry whose node lacks the keyword with that value (a missing node is lacking it too). */
export function nodesWithoutKeyword(
  entries: readonly { where: string; node: Json | undefined }[],
  keyword: string,
  value: unknown,
): string[] {
  return entries.filter(({ node }) => node?.[keyword] !== value).map(({ where }) => where);
}
