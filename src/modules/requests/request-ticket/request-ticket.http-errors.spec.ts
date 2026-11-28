import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import {
  RequestTicketItemsRefusedError,
  RequestTicketNotFoundError,
  RequestTicketNotRequesterError,
  RequestTicketTooManyItemsError,
} from './request-ticket.errors';
import { REQUEST_TICKET_ERROR_EXAMPLES, toRequestTicketApiException } from './request-ticket.http-errors';

describe('request-ticket.http-errors', () => {
  it.each([
    {
      name: 'RequestTicketNotFoundError -> 404 REQUEST_TICKET.NOT_FOUND',
      error: new RequestTicketNotFoundError(),
      status: HttpStatus.NOT_FOUND,
      code: 'REQUEST_TICKET.NOT_FOUND',
      details: undefined,
    },
    {
      name: 'RequestTicketNotRequesterError -> 403 REQUEST_TICKET.NOT_REQUESTER',
      error: new RequestTicketNotRequesterError(),
      status: HttpStatus.FORBIDDEN,
      code: 'REQUEST_TICKET.NOT_REQUESTER',
      details: undefined,
    },
    {
      name: 'RequestTicketTooManyItemsError(7) -> 422 REQUEST_TICKET.TOO_MANY_ITEMS',
      error: new RequestTicketTooManyItemsError(7),
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'REQUEST_TICKET.TOO_MANY_ITEMS',
      details: { max: 6, count: 7 },
    },
    {
      name: 'RequestTicketItemsRefusedError -> 422 REQUEST_TICKET.ITEMS_REFUSED',
      error: new RequestTicketItemsRefusedError([
        {
          position: 2,
          planId: '11111111-1111-4111-8111-111111111111',
          reason: 'DUPLICATE_IN_TICKET',
          duplicateOfPosition: 1,
        },
      ]),
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'REQUEST_TICKET.ITEMS_REFUSED',
      details: {
        items: [
          {
            position: 2,
            planId: '11111111-1111-4111-8111-111111111111',
            reason: 'DUPLICATE_IN_TICKET',
            duplicateOfPosition: 1,
          },
        ],
      },
    },
  ])('$name', ({ error, status, code, details }) => {
    const mapped = toRequestTicketApiException(error);

    expect(mapped).toBeInstanceOf(ApiException);
    const exception = mapped as ApiException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({
      code,
      ...(details === undefined ? {} : { details }),
    });
    expect(typeof (exception.getResponse() as { message: unknown }).message).toBe('string');
  });

  it('delegates access-request domain errors to toAccessRequestApiException', () => {
    const mapped = toRequestTicketApiException(new AccessRequestNotFoundError()) as ApiException;

    expect(mapped).toBeInstanceOf(ApiException);
    expect(mapped.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(mapped.getResponse()).toMatchObject({ code: 'ACCESS_REQUEST.NOT_FOUND' });
  });

  it('exposes OpenAPI error examples for all 4 ticket errors', () => {
    expect(REQUEST_TICKET_ERROR_EXAMPLES.NOT_FOUND).toMatchObject({ code: 'REQUEST_TICKET.NOT_FOUND' });
    expect(REQUEST_TICKET_ERROR_EXAMPLES.NOT_REQUESTER).toMatchObject({
      code: 'REQUEST_TICKET.NOT_REQUESTER',
    });
    expect(REQUEST_TICKET_ERROR_EXAMPLES.TOO_MANY_ITEMS).toMatchObject({
      code: 'REQUEST_TICKET.TOO_MANY_ITEMS',
      details: { max: 6, count: 7 },
    });
    expect(REQUEST_TICKET_ERROR_EXAMPLES.ITEMS_REFUSED).toMatchObject({
      code: 'REQUEST_TICKET.ITEMS_REFUSED',
    });
  });
});
