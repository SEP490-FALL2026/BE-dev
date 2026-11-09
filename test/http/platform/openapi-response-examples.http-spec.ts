import { Reflector } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { SUCCESS_MESSAGE_METADATA } from '../../../src/infrastructure/http/decorators/api-success-response.decorator';
import { errorEnvelopeSchema } from '../../../src/infrastructure/http/dto/error-envelope.dto';
import {
  BODYLESS_RESPONSES,
  NO_EXAMPLE_RESPONSES,
  ROUTE_ERROR_CODE_PARTS,
  ROUTE_ERROR_CODES,
  SUCCESS_MESSAGES,
  type RouteErrorStatus,
} from '../../support/openapi-example-manifest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { createHttpContractApp } from '../../support/http-contract-app';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';
import { HTTP_METHODS, INTERNAL_CODE, routeHandlersOf } from '../../support/openapi-inventory';

/** response examples */
describe('API inventory (e2e): response examples', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createHttpContractApp();

    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app.close();
  });

  describe('response examples (OPENAPI-EXAMPLE.1)', () => {
    type Example = { summary?: string; value?: unknown };
    type Media = { schema?: unknown; examples?: Record<string, Example> };
    type Described = { description?: string; content?: Record<string, Media> };
    type Operation = {
      operationId: string;
      parameters?: unknown[];
      requestBody?: { content?: Record<string, unknown> };
      responses: Record<string, Described>;
    };

    const all = (): Operation[] =>
      Object.values(document.paths).flatMap((item) =>
        HTTP_METHODS.flatMap((method) => (item[method] ? [item[method] as unknown as Operation] : [])),
      );
    const responses = (status: (code: number) => boolean) =>
      all().flatMap((operation) =>
        Object.entries(operation.responses)
          .filter(([code]) => status(Number(code)))
          .map(([code, response]) => ({ operation, status: code, response, key: `${operation.operationId} ${code}` })),
      );
    /** Effective access of each operation, read from the same metadata the guards read. */
    const accessByOperation = () =>
      new Map(routeHandlersOf(app).map((handler) => [handler.operationId, handler.declarations[0]] as const));
    const isSuccess = (code: number) => code >= 200 && code < 300;
    const isError = (code: number) => code >= 400;
    const json = (response: Described) => response.content?.['application/json'];

    /**
     * The codes every operation of a kind answers with, written out from the guards, the validation pipe, the throttler
     * and the request parsers (not asked of the code that builds the examples). Every guarded handler passes its errors
     * through `toUnavailableApiException`, so its 503 is also SERVICE_UNAVAILABLE (traced 25/10/2026); a multipart form
     * validated by a DTO lists its VALIDATION_ERROR in ROUTE_ERROR_CODES, since the document cannot show that.
     */
    function globalCodes(operation: Operation, status: string, access: string | undefined): string[] {
      const takesJson = Boolean(operation.requestBody?.content?.['application/json']);
      const takesForm = Boolean(operation.requestBody?.content?.['multipart/form-data']);
      const hasInput = (operation.parameters?.length ?? 0) > 0 || takesJson;
      const guarded = access !== 'public';
      const codes: string[] = [];
      if (status === '401' && guarded && access !== 'device')
        codes.push('AUTHENTICATION_REQUIRED', 'INVALID_ACCESS_TOKEN');
      if (status === '503' && guarded) codes.push('TOKEN_VERIFICATION_UNAVAILABLE', 'SERVICE_UNAVAILABLE');
      if (status === '403' && access === 'roles') codes.push('AUTHORIZATION.FORBIDDEN');
      if (status === '422' && hasInput) codes.push('VALIDATION_ERROR');
      if (status === '429') codes.push('HTTP_TOO_MANY_REQUESTS');
      if (status === '400' && (takesJson || takesForm)) codes.push('HTTP_BAD_REQUEST');
      if (status === '413' && (takesJson || takesForm)) codes.push('HTTP_PAYLOAD_TOO_LARGE');
      if (status === '415' && takesJson) codes.push('HTTP_UNSUPPORTED_MEDIA_TYPE');
      return codes;
    }

    it('G-L7: every route a collector calls shows the three device 401 codes, and no user 401 code', () => {
      const problems: string[] = [];
      const access = accessByOperation();
      for (const { operation, key, response } of responses((code) => code === 401)) {
        if (access.get(operation.operationId) !== 'device') continue;
        const shown = JSON.stringify(json(response) ?? {});
        for (const code of ['DEVICE.CREDENTIAL_INVALID', 'DEVICE.CREDENTIAL_REVOKED', 'DEVICE.CREDENTIAL_EXPIRED']) {
          if (!shown.includes(code)) problems.push(`${key}: ${code} missing`);
        }
        for (const code of ['AUTHENTICATION_REQUIRED', 'INVALID_ACCESS_TOKEN']) {
          if (shown.includes(code)) problems.push(`${key}: ${code} is not a device answer`);
        }
      }

      expect(problems).toEqual([]);
    });

    it('every JSON success response shows exactly the message its decorator declares, on the unchanged DTO', () => {
      const reflector = app.get(Reflector);
      const declared = new Map(
        routeHandlersOf(app).map((handler) => [
          handler.operationId,
          reflector.get<string | undefined>(SUCCESS_MESSAGE_METADATA, handler.target as () => unknown),
        ]),
      );
      const problems: string[] = [];
      const shown: Record<string, string> = {};
      for (const { operation, response, key } of responses(isSuccess)) {
        const media = json(response);
        if (!media) {
          if (!(key in BODYLESS_RESPONSES)) problems.push(`${key}: no JSON body and no documented reason`);
          continue;
        }
        const schema = media.schema as { allOf?: [{ $ref?: string }, unknown] } | undefined;
        const [dto, overlay] = schema?.allOf ?? [];
        const message = (overlay as { properties?: { message?: { example?: unknown } } } | undefined)?.properties
          ?.message?.example;
        if (schema?.allOf?.length !== 2 || !dto?.$ref?.startsWith('#/components/schemas/'))
          problems.push(`${key}: the DTO schema is not kept`);
        if (JSON.stringify(overlay) !== JSON.stringify({ properties: { message: { example: message } } }))
          problems.push(`${key}: the overlay carries more than the message example`);
        if (message !== declared.get(operation.operationId)) problems.push(`${key}: example differs from metadata`);
        if (media.examples !== undefined) problems.push(`${key}: a whole-body example hides the data schema`);
        shown[operation.operationId] = String(message);
      }

      expect(problems).toEqual([]);
      expect(shown).toEqual(SUCCESS_MESSAGES);
    });

    it('marks only the responses that really have no body as bodyless', () => {
      const bodyless = responses(isSuccess)
        .filter(({ response }) => !json(response))
        .map(({ key }) => key);

      expect(bodyless.sort()).toEqual(Object.keys(BODYLESS_RESPONSES).sort());
      expect(responses(isError).filter(({ response }) => !json(response))).toEqual([]);
    });

    it('every JSON error response shows named examples the error envelope schema accepts', () => {
      const problems = responses(isError).flatMap(({ response, key }) => {
        const examples = Object.entries(json(response)?.examples ?? {});
        // A response the running system cannot answer yet shows nothing rather than a code it cannot return.
        if (key in NO_EXAMPLE_RESPONSES) return examples.length === 0 ? [] : [`${key}: registered as unreachable`];
        if (examples.length === 0) return [`${key}: no example`];

        return examples.flatMap(([name, example]) => {
          const parsed = errorEnvelopeSchema.safeParse(example.value);
          if (!parsed.success) return [`${key} ${name}: not an error envelope`];
          const { code, message, requestId } = parsed.data.error;
          const wrong: string[] = [];
          if (name !== code) wrong.push(`${key} ${name}: named differently from its code ${code}`);
          if (example.summary !== message) wrong.push(`${key} ${name}: summary differs from the message`);
          if (requestId !== 'req_example') wrong.push(`${key} ${name}: requestId ${requestId}`);
          return wrong;
        });
      });

      expect(problems).toEqual([]);
    });

    it('shows exactly the codes that each operation can answer with at each status', () => {
      const access = accessByOperation();
      const mismatches = responses(isError).flatMap(({ operation, status, response, key }) => {
        const own = ROUTE_ERROR_CODES[operation.operationId]?.[status as RouteErrorStatus] ?? [];
        const expected = [...globalCodes(operation, status, access.get(operation.operationId)), ...own].sort();
        const shown = Object.keys(json(response)?.examples ?? {}).sort();
        return JSON.stringify(shown) === JSON.stringify(expected)
          ? []
          : [`${key}: shows ${shown.join(', ')}; reachable ${expected.join(', ')}`];
      });
      const declared = new Set(responses(isError).map(({ key }) => key));
      const stale = Object.entries(ROUTE_ERROR_CODES).flatMap(([id, byStatus]) =>
        Object.keys(byStatus)
          .filter((status) => !declared.has(`${id} ${status}`))
          .map((status) => `${id} ${status}`),
      );

      const staleNoExample = Object.keys(NO_EXAMPLE_RESPONSES).filter((key) => !declared.has(key));

      expect(mismatches).toEqual([]);
      expect(stale).toEqual([]);
      expect(staleNoExample).toEqual([]);
    });

    it('lists each operation once across the parts of the route-code manifest', () => {
      const listed = ROUTE_ERROR_CODE_PARTS.flat();

      expect(listed.filter((operationId, index) => listed.indexOf(operationId) !== index)).toEqual([]);
    });

    it('keeps every example short, readable and free of secrets, personal data and internal codes', () => {
      const problems: string[] = [];
      const tooLong = (text: string, max: number) => [...text].length > max;
      for (const { response, key } of responses(isError)) {
        for (const [name, example] of Object.entries(json(response)?.examples ?? {})) {
          const { code, message } = (example.value as { error: { code: string; message: string } }).error;
          const text = JSON.stringify(example.value);
          // Upper-case code words (ROLE_DERIVED, PLAN_TERMS.INSTALL_LIMIT_…) are words, not random strings.
          const withoutCodes = text.replace(/\b[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)*\b/g, '');
          if (tooLong(code, 80)) problems.push(`${key} ${name}: code over 80 characters`);
          if (tooLong(message, 160)) problems.push(`${key} ${name}: message over 160 characters`);
          if (/[A-Za-z0-9_-]{32,}/.test(withoutCodes)) problems.push(`${key} ${name}: a long random-looking string`);
          // A token or secret value — not the word "Bearer" in a message that asks for one.
          if (/eyJ[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._~+/-]{8,}|password\s*[:=]|secret|token\s*[:=]/i.test(text))
            problems.push(`${key} ${name}: a credential or secret`);
          if (/[^\s"@<>]+@[^\s"@<>]+\.[a-z]{2,}/i.test(text)) problems.push(`${key} ${name}: an email address`);
          // One fixed placeholder instant is allowed where a contract's details carry a time; nothing that looks live.
          if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text.replaceAll('2026-01-01T00:00:00.000Z', '')))
            problems.push(`${key} ${name}: a timestamp`);
          if (INTERNAL_CODE.test(text)) problems.push(`${key} ${name}: an internal requirement code`);
        }
      }
      for (const [id, message] of Object.entries(SUCCESS_MESSAGES)) {
        if (tooLong(message, 80)) problems.push(`${id}: success message over 80 characters`);
      }

      expect(problems).toEqual([]);
    });
  });
});
