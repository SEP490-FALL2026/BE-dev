import type { OpenAPIObject } from '@nestjs/swagger';
import { REVEAL_LIMITS } from '../../../src/modules/licensing/license-key/license-key-reveal-quota.repo';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { createHttpContractApp } from '../../support/http-contract-app';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';
import { HTTP_METHODS } from '../../support/openapi-inventory';

/** responses the runtime answers and the contract used to leave out */
describe('API inventory (e2e): responses the runtime answers and the contract used to leave out', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createHttpContractApp();

    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app.close();
  });

  describe('responses the runtime answers and the contract used to leave out (P28-12)', () => {
    const ERROR_ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };
    type Described = { description?: string; content?: Record<string, { schema?: unknown }> };
    type Operation = {
      operationId?: string;
      parameters?: { name: string; in: string; schema?: { default?: unknown } }[];
      requestBody?: { content?: Record<string, unknown> };
      responses: Record<string, Described>;
    };
    const all = (): Operation[] =>
      Object.values(document.paths).flatMap((item) =>
        HTTP_METHODS.flatMap((method) => (item[method] ? [item[method] as unknown as Operation] : [])),
      );
    const operation = (id: string): Operation => {
      const found = all().find((candidate) => candidate.operationId === id);
      if (!found) throw new Error(`No operation ${id}`);

      return found;
    };
    const schemaOf = (response: Described | undefined) => response?.content?.['application/json']?.schema;
    const idsWhere = (test: (candidate: Operation) => boolean) =>
      all()
        .filter(test)
        .map((candidate) => candidate.operationId)
        .sort();

    it('declares the 400 and 413 of the multipart limits on the three upload routes, which are the only multipart routes', () => {
      // budgetVersionImport (G5) takes one file under the same limits (Prompt 02: it declared neither answer).
      const uploads = ['budgetVersionImport', 'employeeImportUpload', 'seatBaselineImportUpload'];
      expect(idsWhere((candidate) => Boolean(candidate.requestBody?.content?.['multipart/form-data']))).toEqual(
        uploads,
      );
      for (const id of uploads) {
        const { responses } = operation(id);
        expect({ id, schema400: schemaOf(responses['400']), schema413: schemaOf(responses['413']) }).toEqual({
          id,
          schema400: ERROR_ENVELOPE,
          schema413: ERROR_ENVELOPE,
        });
        expect(responses['400']?.description).toContain('HTTP_BAD_REQUEST');
        expect(responses['413']?.description).toContain('HTTP_PAYLOAD_TOO_LARGE');
        expect(responses['413']?.description).toContain('2 MiB');
      }
    });

    it('declares the 413 of the JSON body limit on exactly the operations that take a JSON body (P29-N1)', () => {
      const takesJson = (candidate: Operation) => Boolean(candidate.requestBody?.content?.['application/json']);
      const jsonBodies = all().filter(takesJson);

      expect(jsonBodies.length).toBeGreaterThan(0);
      for (const found of jsonBodies) {
        const id = found.operationId;
        const response = found.responses['413'];
        expect({ id, schema: schemaOf(response) }).toEqual({ id, schema: ERROR_ENVELOPE });
        expect({ id, code: response?.description?.includes('HTTP_PAYLOAD_TOO_LARGE') }).toEqual({ id, code: true });
        expect({ id, limit: response?.description?.includes('100 KiB') }).toEqual({ id, limit: true });
      }
      // A 413 anywhere else is a multipart upload's own file limit, or a mistake.
      expect(idsWhere((candidate) => candidate.responses['413'] !== undefined && !takesJson(candidate))).toEqual([
        'budgetVersionImport',
        'employeeImportUpload',
        'seatBaselineImportUpload',
      ]);
    });

    it('declares the 400 and 415 of the JSON parser on every operation with a JSON body, once (P29-N4)', () => {
      const takesJson = (candidate: Operation) => Boolean(candidate.requestBody?.content?.['application/json']);
      const occurrences = (text: string | undefined, part: string) => (text ?? '').split(part).length - 1;

      for (const found of all().filter(takesJson)) {
        const id = found.operationId;
        const [bad, unsupported] = [found.responses['400'], found.responses['415']];
        expect({ id, schema400: schemaOf(bad), schema415: schemaOf(unsupported) }).toEqual({
          id,
          schema400: ERROR_ENVELOPE,
          schema415: ERROR_ENVELOPE,
        });
        expect({ id, malformed: occurrences(bad?.description, 'it is not valid JSON') }).toEqual({ id, malformed: 1 });
        expect({ id, code400: occurrences(bad?.description, 'HTTP_BAD_REQUEST') }).toEqual({ id, code400: 1 });
        expect({ id, charset: occurrences(unsupported?.description, 'charset other than UTF') }).toEqual({
          id,
          charset: 1,
        });
        expect({ id, code415: unsupported?.description?.includes('HTTP_UNSUPPORTED_MEDIA_TYPE') }).toEqual({
          id,
          code415: true,
        });
      }
      expect(idsWhere((candidate) => candidate.responses['415'] !== undefined && !takesJson(candidate))).toEqual([]);
      expect(
        idsWhere((candidate) => Boolean(candidate.requestBody?.content?.['application/x-www-form-urlencoded'])),
      ).toEqual([]);
    });

    it.each([
      [
        'authResetPassword',
        'The link is not valid (unknown, used, replaced, expired, or the account cannot use it). One answer for all.',
      ],
      [
        'authRedeemInvitation',
        'The link is not valid (unknown, used, replaced, expired, or the account cannot be activated).',
      ],
    ])('keeps the own 400 of %s first and adds the parser’s meaning after it (P29-N4)', (id, own) => {
      const description = operation(id).responses['400']?.description ?? '';

      expect(description.startsWith(`${own} `)).toBe(true);
      expect(description.slice(own.length + 1)).toContain('it is not valid JSON');
    });

    it('declares REPORTING_CURRENCY_NOT_SUPPORTED as a 409 exactly where a price is converted', () => {
      expect(
        idsWhere((candidate) =>
          Object.values(candidate.responses).some((response) =>
            response.description?.includes('REPORTING_CURRENCY_NOT_SUPPORTED'),
          ),
        ),
      ).toEqual(['subscriptionComplete', 'subscriptionCreate', 'subscriptionUpdate']);
      for (const id of ['subscriptionComplete', 'subscriptionCreate', 'subscriptionUpdate']) {
        expect(operation(id).responses['409']?.description).toContain('REPORTING_CURRENCY_NOT_SUPPORTED');
      }
    });

    it('keeps the global 429 of the reveal route next to its own quota, with the numbers of the quota itself', () => {
      const reveal = operation('licenseKeyReveal').responses['429'];
      const global = operation('licenseKeyList').responses['429'];

      expect(schemaOf(reveal)).toEqual(schemaOf(global));
      expect(reveal?.description).toContain(global?.description ?? '<global 429>');
      expect(reveal?.description).toContain(`this minute (${REVEAL_LIMITS.MINUTE})`);
      expect(reveal?.description).toContain(`this day (${REVEAL_LIMITS.DAY})`);
    });

    it('describes the tools in use as they are read: service accounts included, oldest start first', () => {
      const description = operation('departmentToolsInUse').responses['200']?.description ?? '';

      expect(description).toContain('service accounts the department owns');
      expect(description).toContain('oldest start first');
      expect(description).toContain('application then plan name');
    });

    it.each(['nonWorkingDateList', 'departmentWarningList'])(
      'says that %s is paged and how to read past the first page, and refuses a bad page with 422',
      (id) => {
        const found = operation(id);
        const pageSize = found.parameters?.find((parameter) => parameter.name === 'pageSize')?.schema?.default;
        const description = found.responses['200']?.description ?? '';

        expect(pageSize).toBe(20);
        expect(description).toContain(`first ${String(pageSize)} only`);
        expect(description).toContain('pagination.totalItems');
        expect(description).toContain('pagination.totalPages');
        expect(found.responses['422']?.description).toContain('VALIDATION_ERROR');
      },
    );

    it('declares the loser of a race for the dictionary group as its own 409, never the 422 code of a mismatch (P29-N3)', () => {
      for (const id of ['applicationCreate', 'applicationUpdate']) {
        const { responses } = operation(id);
        expect({
          id,
          conflict: responses['409']?.description?.includes('APPLICATION.DICTIONARY_GROUP_CHANGED'),
        }).toEqual({ id, conflict: true });
        expect({ id, reused: responses['409']?.description?.includes('APPLICATION.DICTIONARY_LINE_MISMATCH') }).toEqual(
          {
            id,
            reused: false,
          },
        );
        expect({ id, mismatch: responses['422']?.description?.includes('DICTIONARY_LINE_MISMATCH') }).toEqual({
          id,
          mismatch: true,
        });
      }
    });
  });
});
