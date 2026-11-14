import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { createHttpContractApp } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';
import { clientShape } from '../../support/openapi-semantics';

type Json = Record<string, unknown>;

/**
 * S-3, `QĐ-111al`: the figures of the budget of the year after (`nextYearBudget`) are for the spending approver and Finance only. The document
 * says it: the routes of the spending approver and the check of a request (read by Finance and by the holder of the spend step) carry the key,
 * nothing the sender or the head reads does (the preview, the request, its lines, its history). Read off the in-process document, so a new
 * response that copies the key fails here before any reader sees it.
 */
describe('who reads the budget of the year after (S-3, QĐ-111al, http contract)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createHttpContractApp();
    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  const resolve = (ref: string): unknown =>
    (document.components?.schemas as Record<string, unknown> | undefined)?.[ref.replace('#/components/schemas/', '')];

  /** Every response schema of the operations of the document, with the operation, as the shape a client depends on. */
  const responses = (): Array<{ operationId: string; path: string; shape: string }> =>
    Object.entries(document.paths).flatMap(([path, item]) =>
      Object.values(item as Record<string, unknown>).flatMap((operation) => {
        const found = operation as { operationId?: string; responses?: Record<string, Json> } | null;
        if (!found?.operationId) return [];

        return Object.values(found.responses ?? {}).flatMap((response) => {
          const schema = (response.content as Record<string, { schema?: unknown }> | undefined)?.['application/json']
            ?.schema;

          return schema === undefined
            ? []
            : [{ operationId: found.operationId as string, path, shape: JSON.stringify(clientShape(schema, resolve)) }];
        });
      }),
    );

  it('the detail and the queue of the spending approver, the decisions that answer with the detail, and the check that Finance reads, carry it', () => {
    const carrying = new Set(
      responses()
        .filter((response) => response.shape.includes('"nextYearBudget"'))
        .map((response) => response.operationId),
    );

    expect([...carrying].sort()).toEqual([
      'budgetCheckGet',
      'spendApprovalDecide',
      'spendApprovalGet',
      'spendApprovalLineDecide',
      'spendApprovalList',
    ]);
  });

  it('the preview, the request, the group lines and what the batch decision answers do not carry it', () => {
    const named = ['accessRequestPreview', 'accessRequestSubmit', 'groupRequestSubmit', 'spendBatchDecide'];
    const found = responses().filter((response) => named.includes(response.operationId));

    expect(new Set(found.map((response) => response.operationId))).toEqual(new Set(named));
    for (const response of found)
      expect([response.operationId, response.shape.includes('nextYearBudget')]).toEqual([response.operationId, false]);
  });

  it('what the sender reads of the year after is the part of their own request, as an estimate, and no figure of a budget', () => {
    const preview = responses().find((response) => response.operationId === 'accessRequestPreview');

    expect(preview?.shape).toContain('"estimate"');
    expect(preview?.shape).not.toMatch(/"(approved|remainingAfter)"/);
  });

  it('the figures of the year after are money, a warning that is a boolean, and may all be null: the approval is never refused for it', () => {
    const detail = responses().find((response) => response.operationId === 'spendApprovalGet');
    const shape = JSON.parse(detail?.shape ?? '{}') as Json;
    const find = (node: unknown): Json | undefined => {
      if (node === null || typeof node !== 'object') return undefined;
      const record = node as Json;
      if (record.nextYearBudget !== undefined) return record.nextYearBudget as Json;
      for (const value of Object.values(record)) {
        const inner = find(value);
        if (inner) return inner;
      }

      return undefined;
    };
    const nextYearBudget = find(shape) as { nullable?: boolean; properties?: Record<string, Json> } | undefined;

    expect(nextYearBudget?.nullable).toBe(true);
    expect(Object.keys(nextYearBudget?.properties ?? {}).sort()).toEqual([
      'approved',
      'remaining',
      'remainingAfter',
      'warning',
      'year',
    ]);
    expect(nextYearBudget?.properties?.warning).toMatchObject({ type: 'boolean' });
    expect(nextYearBudget?.properties?.approved).toMatchObject({ nullable: true });
  });
});
