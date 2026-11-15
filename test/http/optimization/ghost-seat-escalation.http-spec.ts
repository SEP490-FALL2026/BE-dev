import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { GhostSeatEscalationKeyReusedError } from '../../../src/modules/optimization/escalation/escalation.errors';
import { EscalationService } from '../../../src/modules/optimization/escalation/escalation.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const PATH = '/api/v1/ghost-seat-recommendations/escalations';
const KEY = 'escalation-key-0123456789';
const ROLES = ['EMPLOYEE', 'MANAGER', 'FINANCE', 'SPENDING_APPROVER', 'SUPER_ADMIN'];

/**
 * `QĐ-111ay`: the contract of the early push, its service replaced: who may call it, what it refuses before it reaches the use case (the key, the
 * list of ids, the note), the shape and the message of the answer, the mapping of the key reused, and what the document promises. What the
 * batch does to the recommendations is proved on PostgreSQL.
 */
describe('ghost seat escalation route (no database)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;
  const escalations = { escalate: jest.fn() };
  const as = (...roles: string[]) => ({ Authorization: bearer(principal(roles)) });
  const post = (body: object, key: string | null = KEY, roles: string[] = ['IT_ADMIN']) => {
    const call = request(app.getHttpServer())
      .post(PATH)
      .set(as(...roles));

    return (key === null ? call : call.set('Idempotency-Key', key)).send(body);
  };

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: EscalationService, useValue: escalations }] });
    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  beforeEach(() => {
    escalations.escalate.mockReset().mockResolvedValue({
      id: OTHER,
      replayed: false,
      results: [
        { recommendationId: ID, outcome: 'ESCALATED', state: 'AWAITING_DECISION', departmentId: OTHER },
        { recommendationId: OTHER, outcome: 'SKIPPED', reason: 'MACHINE_ACCOUNT' },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers 201 with one flat result for each recommendation, the counts and whether the key was answered before', async () => {
    const response = await post({ recommendationIds: [ID, OTHER], note: 'Not used.' }).expect(201);

    expect(bodyOf(response)).toMatchObject({ success: true, message: 'GHOST_SEAT_ESCALATION.CREATED' });
    expect(bodyOf(response).data).toEqual({
      id: OTHER,
      escalated: 1,
      skipped: 1,
      replayed: false,
      results: [
        { recommendationId: ID, outcome: 'ESCALATED', reason: null, state: 'AWAITING_DECISION', departmentId: OTHER },
        { recommendationId: OTHER, outcome: 'SKIPPED', reason: 'MACHINE_ACCOUNT', state: null, departmentId: null },
      ],
    });
    expect(escalations.escalate).toHaveBeenCalledWith(expect.objectContaining({ roles: ['IT_ADMIN'] }), {
      recommendationIds: [ID, OTHER],
      note: 'Not used.',
      idempotencyKey: KEY,
    });
  });

  it('maps a key used for another batch to 409 GHOST_SEAT.ESCALATION_KEY_REUSED', async () => {
    escalations.escalate.mockRejectedValue(new GhostSeatEscalationKeyReusedError());

    const response = await post({ recommendationIds: [ID] }).expect(409);

    expect(bodyOf(response).error.code).toBe('GHOST_SEAT.ESCALATION_KEY_REUSED');
  });

  it('refuses the key it does not like, and the body it does not take, with 422 before the use case runs', async () => {
    const refused: (() => request.Test)[] = [
      () => post({ recommendationIds: [ID] }, null),
      () => post({ recommendationIds: [ID] }, 'short'),
      () => post({ recommendationIds: [ID] }, 'a key with spaces in it!!'),
      () => post({}),
      () => post({ recommendationIds: [] }),
      () => post({ recommendationIds: ['not-a-uuid'] }),
      () => post({ recommendationIds: Array.from({ length: 101 }, () => ID) }),
      () => post({ recommendationIds: [ID], note: 'x'.repeat(501) }),
      () => post({ recommendationIds: [ID], note: '  ' }),
      () => post({ recommendationIds: [ID], departmentId: ID }),
    ];
    for (const call of refused) {
      const response = await call();
      expect(response.status).toBe(422);
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
    expect(escalations.escalate).not.toHaveBeenCalled();
  });

  it('takes a hundred ids, at the edge', async () => {
    await post({ recommendationIds: Array.from({ length: 100 }, () => ID) }).expect(201);
  });

  it.each(ROLES)('refuses %s with 403 and no token with 401', async (role) => {
    await post({ recommendationIds: [ID] }, KEY, [role]).expect(403);
    await request(app.getHttpServer())
      .post(PATH)
      .set('Idempotency-Key', KEY)
      .send({ recommendationIds: [ID] })
      .expect(401);
    expect(escalations.escalate).not.toHaveBeenCalled();
  });

  describe('what the document promises', () => {
    type Schema = { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
    const operation = () => document.paths?.[PATH]?.post;
    const schema = (name: string): Schema => {
      const found = (document.components?.schemas ?? {})[name] as Schema | undefined;
      if (!found) throw new Error(`No schema ${name}`);

      return found;
    };

    it('takes exactly the ids and the note, asks for the key as a header, and names the operation', () => {
      const body = schema('EscalationBodyDto');
      const headers = ((operation()?.parameters ?? []) as { name: string; in: string; required?: boolean }[]).filter(
        (parameter) => parameter.in === 'header',
      );

      expect(operation()?.operationId).toBe('ghostSeatEscalationCreate');
      expect(Object.keys(body.properties ?? {}).sort()).toEqual(['note', 'recommendationIds']);
      expect(body.required).toEqual(['recommendationIds']);
      expect(body.additionalProperties).toBe(false);
      expect(headers.map((header) => [header.name, header.required])).toEqual([['Idempotency-Key', true]]);
    });

    it('shows no name, no usage figure and no evidence of a person in what it answers', () => {
      const text = JSON.stringify(schema('EscalationResponseDto'));

      expect(text).not.toMatch(/"(?:fullName|name|email|avatar|token|responses|totalTokens|evidence)[A-Za-z]*"/i);
      expect(text).toContain('"maxItems":100');
    });
  });
});
