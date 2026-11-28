import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RequestTicketNotFoundError } from '../../../src/modules/requests/request-ticket/request-ticket.errors';
import { RequestTicketViewService } from '../../../src/modules/requests/request-ticket-view/request-ticket-view.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const REQ_ID = '22222222-2222-4222-8222-222222222222';
const EMP_ID = '33333333-3333-4333-8333-333333333333';
const DEPT_ID = '44444444-4444-4444-8444-444444444444';
const PLAN_ID = '55555555-5555-4555-8555-555555555555';

const ticketWire = {
  id: TICKET_ID,
  requester: { employeeId: EMP_ID, employeeCode: 'E1', fullName: 'Nguyen Van A' },
  department: { id: DEPT_ID, code: 'P-DES', name: 'Design' },
  submittedAt: '2026-06-01T08:00:00.000Z',
  status: 'IN_PROGRESS',
  items: [
    {
      position: 1,
      requestId: REQ_ID,
      plan: { id: PLAN_ID, name: 'Miro Business' },
      state: 'AWAITING_SPEND_DECISION',
      termMonths: 3,
      routingMode: 'VIA_HEAD',
      latestReply: {
        kind: 'REQUESTER_RESUBMISSION',
        note: 'dùng cho dự án X, 3 tháng',
        author: { id: EMP_ID, name: 'Nguyen Van A' },
        createdAt: '2026-06-02T09:00:00.000Z',
      },
    },
  ],
};

describe('requestTicketGet HTTP contract', () => {
  let app: INestApplication<App>;
  const get = jest.fn();
  const auth = bearer(principal(['EMPLOYEE'], { employeeId: EMP_ID }));

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [{ token: RequestTicketViewService, useValue: { get } }],
    });
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get(`/api/v1/request-tickets/${TICKET_ID}`).expect(401);
    expect(get).not.toHaveBeenCalled();
  });

  it('validates the ticket id path parameter', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/request-tickets/not-a-uuid')
      .set('Authorization', auth)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(get).not.toHaveBeenCalled();
  });

  it('returns 200 REQUEST_TICKET.FOUND with ticket and item latestReply', async () => {
    get.mockResolvedValueOnce(ticketWire);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/request-tickets/${TICKET_ID}`)
      .set('Authorization', auth)
      .expect(200);

    expect(bodyOf(response).message).toBe('REQUEST_TICKET.FOUND');
    expect((response.body as { data: { ticket: typeof ticketWire } }).data.ticket).toEqual(ticketWire);
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ employeeId: EMP_ID }), TICKET_ID);
  });

  it('maps RequestTicketNotFoundError to 404 REQUEST_TICKET.NOT_FOUND', async () => {
    get.mockRejectedValueOnce(new RequestTicketNotFoundError());

    const response = await request(app.getHttpServer())
      .get(`/api/v1/request-tickets/${TICKET_ID}`)
      .set('Authorization', auth)
      .expect(404);

    expect(bodyOf(response).error.code).toBe('REQUEST_TICKET.NOT_FOUND');
  });
});
