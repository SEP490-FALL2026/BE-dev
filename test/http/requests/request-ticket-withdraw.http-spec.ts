import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import type { TicketWithdrawResultWire } from '../../../src/modules/requests/request-ticket/request-ticket.dto';
import {
  RequestTicketNotFoundError,
  RequestTicketNotRequesterError,
} from '../../../src/modules/requests/request-ticket/request-ticket.errors';
import { TicketWithdrawalService } from '../../../src/modules/requests/withdraw/ticket-withdrawal.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const TICKET_ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
const REQ_1 = '11111111-1111-4111-8111-111111111111';
const REQ_2 = '22222222-2222-4222-8222-222222222222';
const PATH = `/api/v1/request-tickets/${TICKET_ID}/withdrawal`;

describe('W4-08: POST /request-tickets/{id}/withdrawal HTTP contract', () => {
  let app: INestApplication<App>;
  const withdraw = jest.fn<
    Promise<TicketWithdrawResultWire[]>,
    [AuthenticatedPrincipal, string, { reason?: string }]
  >();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [{ token: TicketWithdrawalService, useValue: { withdraw } }],
    });
  });

  beforeEach(() => {
    withdraw.mockReset();
  });

  afterAll(async () => app?.close());

  const call = (body: object = {}) =>
    request(app.getHttpServer())
      .post(PATH)
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .send(body);

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer()).post(PATH).send({}).expect(401);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('returns 200 REQUEST_TICKET.WITHDRAWN with per-item results', async () => {
    withdraw.mockResolvedValueOnce([
      { requestId: REQ_1, outcome: 'WITHDRAWN', reason: null },
      { requestId: REQ_2, outcome: 'SKIPPED', reason: 'WITHDRAWAL_AFTER_DECISION' },
    ]);

    const response = await call({ reason: 'No longer needed' }).expect(200);

    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(withdraw.mock.calls[0]?.[0].employeeId).toBeTruthy();
    expect(withdraw.mock.calls[0]?.[1]).toBe(TICKET_ID);
    expect(withdraw.mock.calls[0]?.[2]).toEqual({ reason: 'No longer needed' });
    expect(bodyOf(response)).toMatchObject({
      success: true,
      message: 'REQUEST_TICKET.WITHDRAWN',
      data: {
        results: [
          { requestId: REQ_1, outcome: 'WITHDRAWN', reason: null },
          { requestId: REQ_2, outcome: 'SKIPPED', reason: 'WITHDRAWAL_AFTER_DECISION' },
        ],
      },
    });
  });

  it('maps RequestTicketNotRequesterError to 403 REQUEST_TICKET.NOT_REQUESTER', async () => {
    withdraw.mockRejectedValueOnce(new RequestTicketNotRequesterError());

    const response = await call().expect(403);
    expect(bodyOf(response).error.code).toBe('REQUEST_TICKET.NOT_REQUESTER');
  });

  it('maps RequestTicketNotFoundError to 404 REQUEST_TICKET.NOT_FOUND', async () => {
    withdraw.mockRejectedValueOnce(new RequestTicketNotFoundError());

    const response = await call().expect(404);
    expect(bodyOf(response).error.code).toBe('REQUEST_TICKET.NOT_FOUND');
  });

  it('rejects invalid id, blank reason, and unknown fields with 422 VALIDATION_ERROR', async () => {
    const invalidId = await request(app.getHttpServer())
      .post('/api/v1/request-tickets/not-a-uuid/withdrawal')
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .send({})
      .expect(422);
    expect(bodyOf(invalidId).error.code).toBe('VALIDATION_ERROR');

    const blankReason = await call({ reason: '   ' }).expect(422);
    expect(bodyOf(blankReason).error.code).toBe('VALIDATION_ERROR');

    const unknownField = await call({ extra: true }).expect(422);
    expect(bodyOf(unknownField).error.code).toBe('VALIDATION_ERROR');

    expect(withdraw).not.toHaveBeenCalled();
  });
});
