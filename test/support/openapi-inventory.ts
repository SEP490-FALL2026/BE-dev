import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { DECORATORS } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  IS_AUTHENTICATED_ONLY_METADATA,
  REQUIRED_ROLES_METADATA,
} from '../../src/infrastructure/security/decorators/access.decorators';
import { IS_PUBLIC_METADATA } from '../../src/infrastructure/security/decorators/public.decorator';

/**
 * What the specs of the API inventory (`test/http/platform/api-inventory*.http-spec.ts`, `openapi-presentation`, `openapi-runtime-responses`,
 * `openapi-response-examples`) read the exported document with. Nothing here asserts.
 */

/** One operation of the document, as the inventory reads it. */
export interface InventoryOperation {
  key: string;
  operationId: string | undefined;
  summary: string | undefined;
  security: unknown;
  responses: Record<string, { description?: string; content?: Record<string, { schema?: unknown }> }>;
}

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** The one bearer scheme the document registers (`DocumentBuilder.addBearerAuth()`). */
export const BEARER_REQUIREMENT = [{ bearer: [] }];

/** Internal requirement and decision codes belong in specs, not in the public API description. */
export const INTERNAL_CODE = /\b(?:US|AC|FR|OQ|R|N|T)-\d|QĐ-|⟹/;

/**
 * CP0-09: the exact patterns the schema generator (zod) emits next to `format: uuid` and `format: date-time`, written out
 * as literals so the test does not ask the cleanup code what "redundant" means.
 */
export const GENERATED_UUID_PATTERN =
  '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
export const GENERATED_DATE_TIME_PATTERN = String.raw`^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))$`;
export const GENERATED_DATE_TIME_WITH_OFFSET_PATTERN = String.raw`^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$`;
/** The business rules the document keeps: codes, message keys and identifiers (written out, not derived). */
export const BUSINESS_PATTERNS = [
  '^[A-Z][A-Z0-9_]{0,99}$',
  String.raw`^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$`,
  String.raw`^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)*$`,
  '^[A-Za-z0-9][A-Za-z0-9._-]*$',
  // An ISO 4217 currency code (finance).
  '^[A-Z]{3}$',
  // An employee or department code (QĐ-93i): uppercase letters or digits joined by single hyphens.
  '^[A-Z0-9]+(-[A-Z0-9]+)*$',
];

/** Visits every object node of the document with its JSON pointer, so a failure names the exact place. */
export function visit(node: unknown, at: string, onNode: (value: Record<string, unknown>, at: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => visit(child, `${at}/${index}`, onNode));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const value = node as Record<string, unknown>;
  onNode(value, at);
  for (const [key, child] of Object.entries(value)) visit(child, `${at}/${key}`, onNode);
}

/** Every operation of the document with its key (`METHOD /path`), operationId, summary, security and responses. */
export function operationsOf(document: OpenAPIObject): InventoryOperation[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item[method];

      return operation
        ? [
            {
              key: `${method.toUpperCase()} ${path}`,
              operationId: operation.operationId,
              summary: operation.summary,
              security: operation.security,
              responses: operation.responses as InventoryOperation['responses'],
            },
          ]
        : [];
    }),
  );
}

/** The route handlers the application mounts, with the access each declares (on the method, else on the controller) and its operationId. */
export interface RouteHandler {
  name: string;
  target: object;
  controller: object;
  declarations: string[];
  operationId: string | undefined;
}

export function routeHandlersOf(app: INestApplication): RouteHandler[] {
  const reflector = app.get(Reflector);
  const handlers: RouteHandler[] = [];

  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new () => object) | null;
      if (!controller?.prototype) continue;

      for (const method of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[method];
        if (typeof handler !== 'function' || reflector.get(METHOD_METADATA, handler) === undefined) continue;

        const kinds: Array<[symbol, string]> = [
          [IS_PUBLIC_METADATA, 'public'],
          [IS_AUTHENTICATED_ONLY_METADATA, 'authenticated'],
          [REQUIRED_ROLES_METADATA, 'roles'],
        ];
        const own = kinds.filter(([key]) => reflector.get(key, handler) !== undefined).map(([, kind]) => kind);
        const onClass = kinds.filter(([key]) => reflector.get(key, controller) !== undefined).map(([, kind]) => kind);

        handlers.push({
          name: `${controller.name}.${method}`,
          target: handler,
          controller,
          declarations: own.length > 0 ? own : onClass,
          operationId: reflector.get<{ operationId?: string } | undefined>(DECORATORS.API_OPERATION, handler)
            ?.operationId,
        });
      }
    }
  }

  return handlers;
}
