import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { businessDate } from '../../../src/infrastructure/http/dto/business-date.dto';
import { createHttpContractApp } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';
import {
  dateLeavesOf,
  documentNodeOf,
  nodesWithoutKeyword,
  requestRoots,
  responseRoots,
  stringLeavesOf,
  type Json,
} from '../../support/openapi-request-rules';
import { routeDtos, type RouteDtos } from '../../support/openapi-semantics';

/**
 * F01: what the request DTOs validate beyond type and length is said in the document, where the keywords of OpenAPI 3.0 can say it.
 * A date is `format: date` (it is also described), an array of distinct scalars is `uniqueItems`, a patch of at least one field is
 * `minProperties: 1`; a text is said to be trimmed only in the description of the field, and only when its schema trims it before it
 * checks it (most texts are bounded as they are sent). Read off the in-process document and the Zod schema of each route, so a date
 * that a new DTO writes by hand, a keyword that is dropped or a promise of trimming the schema does not keep fails here.
 */

/** The arrays that must hold distinct scalars (the one of objects unique by `planId` has no keyword and is described). */
const UNIQUE_ARRAYS: readonly (readonly [operationId: string, path: readonly string[]])[] = [
  ['delegatedRequestSend', ['beneficiaryEmployeeIds']],
  ['spendBatchSubmit', ['requestIds']],
  ['accessRequestSupplementAdd', ['dropEmployeeIds']],
  ['spendBatchDecide', ['requestIds']],
  ['spendApprovalDecide', ['override', 'years']],
  ['spendApprovalLineDecide', ['override', 'years']],
];

/** The bodies that need at least one field, whatever the field. */
const AT_LEAST_ONE_FIELD: readonly string[] = [
  'budgetVersionUpdate',
  'budgetVersionLineUpdate',
  'accessRequestAssessmentSave',
];

/** The description of a node of the document, or an empty string when it has none. */
const descriptionOf = (node: Json | undefined): string =>
  typeof node?.description === 'string' ? node.description : '';

describe('what the document says of the rules of a request (F01)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;
  let routes: RouteDtos[];

  beforeAll(async () => {
    app = await createHttpContractApp();
    document = createOpenApiDocument(app);
    routes = routeDtos(app).filter((route) => route.operationId !== undefined);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app.close();
  });

  /** Every (operation, input, path) that the schema of a route says is a business date, with the node the document has for it. */
  const dateNodes = () =>
    routes.flatMap((route) =>
      requestRoots(document, route).flatMap(({ operationId, input, root, schema }) =>
        dateLeavesOf(schema).map((path) => ({
          where: `${operationId} ${input} ${path.join('.')}`,
          node: documentNodeOf(root, document, path),
        })),
      ),
    );

  it('gives `format: date` and its description to every date a request carries, in a body, a query and a path', () => {
    const leaves = dateNodes();

    expect(leaves.length).toBeGreaterThanOrEqual(96);
    expect(nodesWithoutKeyword(leaves, 'format', 'date')).toEqual([]);
    expect(leaves.filter(({ node }) => typeof node?.description !== 'string').map(({ where }) => where)).toEqual([]);
    expect(leaves.filter(({ node }) => node?.pattern !== undefined).map(({ where }) => where)).toEqual([]);
  });

  it('words the date a request asks for as an instruction to the sender: it must exist, and a day that does not is refused', () => {
    const asked = dateNodes();

    expect(asked.filter(({ node }) => !/must exist/.test(descriptionOf(node))).map(({ where }) => where)).toEqual([]);
  });

  it('words the date a response states for its reader, with the format and no instruction to a sender', () => {
    const stated = routes.flatMap((route) =>
      responseRoots(document, route).flatMap(({ operationId, input, root, schema }) =>
        dateLeavesOf(schema).map((path) => ({
          where: `${operationId} ${input} ${path.join('.')}`,
          node: documentNodeOf(root, document, path),
        })),
      ),
    );

    expect(stated.length).toBeGreaterThanOrEqual(8);
    expect(nodesWithoutKeyword(stated, 'format', 'date')).toEqual([]);
    expect(stated.filter(({ node }) => typeof node?.description !== 'string').map(({ where }) => where)).toEqual([]);
    expect(
      stated.filter(({ node }) => /must exist|refused/.test(descriptionOf(node))).map(({ where }) => where),
    ).toEqual([]);
  });

  it('reaches the dates of a draft that may be any of three requests: each branch of the union carries them', () => {
    const draft = dateNodes().filter(({ where }) => where.startsWith('accessRequestDraftSave Body'));

    expect(draft.map(({ where }) => where)).toEqual(expect.arrayContaining([expect.stringContaining('|')]));
    expect(nodesWithoutKeyword(draft, 'format', 'date')).toEqual([]);
  });

  it('states `uniqueItems: true` on the six arrays of distinct scalars', () => {
    const found = UNIQUE_ARRAYS.map(([operationId, path]) => {
      const route = routes.find((candidate) => candidate.operationId === operationId);
      const root = requestRoots(document, route as RouteDtos).find((entry) => entry.input === 'Body');

      return { where: `${operationId} ${path.join('.')}`, node: documentNodeOf(root?.root, document, [...path]) };
    });

    expect(nodesWithoutKeyword(found, 'uniqueItems', true)).toEqual([]);
  });

  it('states `minProperties: 1` on the three bodies that need at least one field', () => {
    const found = AT_LEAST_ONE_FIELD.map((operationId) => {
      const route = routes.find((candidate) => candidate.operationId === operationId);
      const root = requestRoots(document, route as RouteDtos).find((entry) => entry.input === 'Body');

      return { where: operationId, node: documentNodeOf(root?.root, document, []) };
    });

    expect(nodesWithoutKeyword(found, 'minProperties', 1)).toEqual([]);
  });

  /** Every text a request carries, with what its schema does to the whitespace around it and the node of the document that describes it. */
  const textNodes = () =>
    routes.flatMap((route) =>
      requestRoots(document, route).flatMap(({ operationId, input, root, schema }) =>
        stringLeavesOf(schema).map((leaf) => ({
          where: `${operationId} ${input} ${leaf.path.join('.')}`,
          node: documentNodeOf(root, document, leaf.path),
          ...leaf,
        })),
      ),
    );

  it('says a text is trimmed only where its schema removes the whitespace around it before it checks the text', () => {
    const described = textNodes().filter(({ node }) => /\btrimmed\b/.test(descriptionOf(node)));

    // the four texts that say so: the two emails, the web address and the reset email
    expect(described.length).toBeGreaterThanOrEqual(4);
    expect(described.filter(({ trimsBeforeChecks }) => !trimsBeforeChecks).map(({ where }) => where)).toEqual([]);
  });

  it('never describes as trimmed a text whose schema leaves the whitespace in', () => {
    const untrimmed = textNodes().filter(({ trims }) => !trims);

    // many texts are bounded as they are sent (passwords, tokens, free text): none is promised to be trimmed
    expect(untrimmed.length).toBeGreaterThanOrEqual(50);
    expect(untrimmed.filter(({ node }) => /trim/i.test(descriptionOf(node))).map(({ where }) => where)).toEqual([]);
  });

  it('makes no promise of trimming in the description of the document except through the description of a field', () => {
    const sentences = (document.info.description ?? '').split(/(?<=\.)\s+/);
    const aboutTrimming = sentences.filter((sentence) => /trim/i.test(sentence));

    expect(aboutTrimming.length).toBeGreaterThanOrEqual(1);
    expect(aboutTrimming.filter((sentence) => !/whose description says/.test(sentence))).toEqual([]);
  });

  describe('finds what is missing (the proof that the checks above can fail)', () => {
    it('tells a text that is trimmed first from one that is trimmed after its length, one that is not and one lower-cased', () => {
      const schema = z.strictObject({
        first: z.string().trim().min(1).max(5),
        late: z.string().max(5).trim(),
        bare: z.string().min(1).max(5),
        lower: z.string().toLowerCase(),
        email: z.string().trim().max(50).pipe(z.email()).nullish(),
      });

      expect(
        stringLeavesOf(schema).map(({ path, trims, trimsBeforeChecks }) => [path.join('.'), trims, trimsBeforeChecks]),
      ).toEqual([
        ['first', true, true],
        ['late', true, false],
        ['bare', false, false],
        ['lower', false, false],
        ['email', true, true],
      ]);
    });

    it('names a date of a schema whose document node has no format, and one that has it', () => {
      const bare = z.strictObject({ on: z.string(), lines: z.array(z.strictObject({ day: businessDate.optional() })) });
      const handWritten = z.strictObject({ on: z.string().refine((value) => value.length > 0) });

      expect(dateLeavesOf(bare)).toEqual([['lines', '[]', 'day']]);
      expect(dateLeavesOf(handWritten)).toEqual([]);

      const without = {
        type: 'object',
        properties: { lines: { type: 'array', items: { properties: { day: { type: 'string' } } } } },
      };
      const withFormat = {
        type: 'object',
        properties: { lines: { type: 'array', items: { properties: { day: { type: 'string', format: 'date' } } } } },
      };
      const look = (root: Json) => [
        { where: 'x', node: documentNodeOf(root, { components: { schemas: {} } } as never, ['lines', '[]', 'day']) },
      ];

      expect(nodesWithoutKeyword(look(without), 'format', 'date')).toEqual(['x']);
      expect(nodesWithoutKeyword(look(withFormat), 'format', 'date')).toEqual([]);
    });

    it('follows a reference, a nullable date and each option of a union to the node the document keeps for it', () => {
      const document = {
        components: {
          schemas: {
            Body: { type: 'object', properties: { end: { type: 'string', format: 'date', nullable: true } } },
          },
        },
      } as unknown as OpenAPIObject;
      const union = { oneOf: [{ properties: { a: { format: 'date' } } }, { properties: { b: { format: 'date' } } }] };

      expect(documentNodeOf({ $ref: '#/components/schemas/Body' }, document, ['end'])).toMatchObject({
        format: 'date',
      });
      expect(documentNodeOf(union, document, ['|1', 'b'])).toEqual({ format: 'date' });
      expect(documentNodeOf(union, document, ['|0', 'b'])).toBeUndefined();
    });
  });
});
