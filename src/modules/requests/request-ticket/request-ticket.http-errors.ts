import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import {
  RequestTicketItemsRefusedError,
  RequestTicketNotFoundError,
  RequestTicketNotRequesterError,
  RequestTicketTooManyItemsError,
} from './request-ticket.errors';
import { MAX_TICKET_ITEMS } from './request-ticket.policy';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps ticket domain errors to HTTP ApiException responses; delegates other request errors. */
export function toRequestTicketApiException(error: unknown): unknown {
  if (error instanceof RequestTicketNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'REQUEST_TICKET.NOT_FOUND', error.message);
  }
  if (error instanceof RequestTicketNotRequesterError) {
    return refuse(HttpStatus.FORBIDDEN, 'REQUEST_TICKET.NOT_REQUESTER', error.message);
  }
  if (error instanceof RequestTicketTooManyItemsError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'REQUEST_TICKET.TOO_MANY_ITEMS',
      message: error.message,
      details: { max: MAX_TICKET_ITEMS, count: error.count },
    });
  }
  if (error instanceof RequestTicketItemsRefusedError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'REQUEST_TICKET.ITEMS_REFUSED',
      message: error.message,
      details: { items: [...error.items] },
    });
  }

  return toAccessRequestApiException(error);
}

const example = (error: Error) => errorExampleOf(toRequestTicketApiException(error));

/** OpenAPI examples for request-ticket errors produced by the runtime mapper. */
export const REQUEST_TICKET_ERROR_EXAMPLES = {
  NOT_FOUND: example(new RequestTicketNotFoundError()),
  NOT_REQUESTER: example(new RequestTicketNotRequesterError()),
  TOO_MANY_ITEMS: example(new RequestTicketTooManyItemsError(7)),
  ITEMS_REFUSED: example(
    new RequestTicketItemsRefusedError([
      {
        position: 2,
        planId: '<plan-id>',
        reason: 'DUPLICATE_IN_TICKET',
        duplicateOfPosition: 1,
      },
    ]),
  ),
} as const;
