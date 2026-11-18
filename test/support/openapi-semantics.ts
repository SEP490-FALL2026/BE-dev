import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PARAMTYPES_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ModulesContainer } from '@nestjs/core';
import { DECORATORS } from '@nestjs/swagger';
import { z } from 'zod';
import { isRedundantFormatPattern } from '../../src/infrastructure/http/openapi-presentation';

/**
 * OPENAPI-EXAMPLE.1-F3: what a generated client depends on in a schema, so the exported document can be compared with
 * the runtime contract — Zod's own OpenAPI 3.0 rendering of the DTO the route really validates or serializes.
 * Annotations (descriptions, examples, titles), extensions and a pattern that only repeats its uuid/date-time format are
 * presentation; types, nullability, required, enums, formats, bounds, items, maps and `$ref` targets are contract.
 */

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const escape = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');

const ANNOTATIONS = new Set(['description', 'example', 'examples', 'title', 'deprecated', 'readOnly', 'writeOnly']);

export type RefResolver = (ref: string) => unknown;

/** The client-relevant shape of a schema: `$ref` resolved (cycles marked), annotations dropped, order made canonical. */
export function clientShape(schema: unknown, resolve: RefResolver, seen: ReadonlySet<string> = new Set()): unknown {
  if (Array.isArray(schema)) return schema.map((item) => clientShape(item, resolve, seen));
  if (!isRecord(schema)) return schema;

  if (typeof schema.$ref === 'string') {
    if (seen.has(schema.$ref)) return { $cycle: schema.$ref };
    const { $ref, ...siblings } = schema;
    const target = resolve($ref);
    if (!isRecord(target)) return { $unresolved: $ref };
    return clientShape({ ...target, ...siblings }, resolve, new Set([...seen, $ref]));
  }

  let node: Json = schema;
  // `allOf: [one]` next to other keywords is the OpenAPI 3.0 spelling of "that schema, plus these keywords".
  if (Array.isArray(node.allOf) && node.allOf.length === 1) {
    const { allOf, ...rest } = node;
    const member = clientShape(allOf[0], resolve, seen);
    node = isRecord(member) ? { ...member, ...rest } : node;
  }

  const shape: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (ANNOTATIONS.has(key) || key.startsWith('x-')) continue;
    if (key === 'nullable' && value !== true) continue;
    if (key === 'pattern' && isRedundantFormatPattern(node.format, value)) continue;
    if (key === 'required' && Array.isArray(value)) shape[key] = (value as unknown[]).map(String).sort();
    else if (key === 'properties' && isRecord(value))
      shape[key] = Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((name) => [name, clientShape(value[name], resolve, seen)]),
      );
    else shape[key] = clientShape(value, resolve, seen);
  }
  // A nullable enum may or may not list null among its values: OpenAPI 3.0.3 asks for it, Zod's renderer omits it.
  if (shape.nullable === true && Array.isArray(shape.enum)) shape.enum = shape.enum.filter((value) => value !== null);
  return shape;
}

/** Every place two client shapes differ, as `pointer: reason`. Empty when they are equivalent. */
export function shapeDifferences(expected: unknown, actual: unknown, at: string): string[] {
  if (isRecord(expected) && isRecord(actual)) {
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap((key) => {
      const pointer = `${at}/${escape(key)}`;
      if (!(key in actual)) return [`${pointer}: missing (runtime contract has ${JSON.stringify(expected[key])})`];
      if (!(key in expected)) return [`${pointer}: not in the runtime contract (${JSON.stringify(actual[key])})`];
      return shapeDifferences(expected[key], actual[key], pointer);
    });
  }
  if (Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length) {
    return expected.flatMap((item, index) => shapeDifferences(item, actual[index], `${at}/${index}`));
  }
  return JSON.stringify(expected) === JSON.stringify(actual)
    ? []
    : [`${at}: ${JSON.stringify(actual)} where the runtime contract has ${JSON.stringify(expected)}`];
}

/** Zod's own OpenAPI 3.0 rendering of a DTO schema (input side, as nestjs-zod reads DTOs) and its `$defs` resolver. */
export function runtimeContractOf(schema: z.ZodType): { schema: Json; resolve: RefResolver } {
  const root = { ...z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' }) } as Json;
  const definitions = isRecord(root.$defs) ? root.$defs : {};
  delete root.$defs;
  delete root.$schema;
  return { schema: root, resolve: (ref) => definitions[ref.replace('#/$defs/', '')] };
}

export interface ZodDtoClass {
  name: string;
  schema: z.ZodType;
}

export interface RouteDtos {
  /** `Controller.method`, to name a failure. */
  handler: string;
  operationId: string | undefined;
  body?: ZodDtoClass;
  query?: ZodDtoClass;
  params?: ZodDtoClass;
  /** DTO of each declared response, by status. */
  responses: Array<{ status: string; dto: ZodDtoClass }>;
}

/** The marker nestjs-zod puts on every DTO class (its `isZodDto` guard is exported as a type only). */
const asZodDto = (value: unknown): ZodDtoClass | undefined =>
  typeof value === 'function' && (value as { isZodDto?: unknown }).isZodDto === true
    ? (value as unknown as ZodDtoClass)
    : undefined;

/**
 * The DTO classes each mounted route really uses, read from the metadata Nest and Swagger read: `@Body()`, `@Query()`
 * and `@Param()` without a property key (the whole DTO), and the `type` of every `@ApiResponse`.
 */
export function routeDtos(app: INestApplication): RouteDtos[] {
  const routes: RouteDtos[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new () => object) | null;
      if (!controller?.prototype) continue;
      for (const method of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[method];
        if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
        const operation = Reflect.getMetadata(DECORATORS.API_OPERATION, handler) as
          { operationId?: string } | undefined;
        const declared = (Reflect.getMetadata(DECORATORS.API_RESPONSE, handler) ?? {}) as Record<
          string,
          { type?: unknown }
        >;
        const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {}) as Record<
          string,
          { index: number; data?: unknown }
        >;
        const prototype = controller.prototype as object;
        const types = (Reflect.getMetadata(PARAMTYPES_METADATA, prototype, method) ?? []) as unknown[];

        const route: RouteDtos = {
          handler: `${controller.name}.${method}`,
          operationId: operation?.operationId,
          responses: Object.entries(declared).flatMap(([status, response]) => {
            const dto = asZodDto(response.type);
            return dto ? [{ status, dto }] : [];
          }),
        };
        for (const [key, arg] of Object.entries(args)) {
          if (arg.data !== undefined) continue;
          const dto = asZodDto(types[arg.index]);
          // Nest keys each argument `<RouteParamtypes>:<index>`.
          const kind: RouteParamtypes = Number(key.split(':')[0]);
          if (kind === RouteParamtypes.BODY) route.body = dto;
          else if (kind === RouteParamtypes.QUERY) route.query = dto;
          else if (kind === RouteParamtypes.PARAM) route.params = dto;
        }
        routes.push(route);
      }
    }
  }
  return routes;
}
