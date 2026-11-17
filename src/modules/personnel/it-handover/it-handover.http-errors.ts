import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toPersonnelAccessApiException } from '../personnel-access.http-errors';
import { ItHandoverRefusedError, type ItHandoverRefusal } from './it-handover.errors';

/** The answer of each refusal, by its semantic code. */
const ANSWERS: Readonly<Record<ItHandoverRefusal, { status: HttpStatus; message: string }>> = {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'The departure or the transfer does not exist.' },
  SOURCE_CANCELLED: {
    status: HttpStatus.CONFLICT,
    message: 'The departure or the transfer was cancelled: there is nothing to hand over for it.',
  },
  NOT_YET_YOURS: {
    status: HttpStatus.FORBIDDEN,
    message:
      'Before the block of the departure or the day the transfer takes effect, only the IT Admin who is leaving hands their responsibilities over.',
  },
  NOTHING_TO_HAND_OVER: {
    status: HttpStatus.CONFLICT,
    message: 'The IT Admin answers for no subscription and no application now.',
  },
  SAME_PERSON: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The responsibilities cannot be handed to the IT Admin who gives them up.',
  },
  TARGET_NOT_IT_ADMIN: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The IT Admin who takes the responsibilities must be an IT Admin who works now.',
  },
};

/** Maps a refusal of the hand-over to its answer; a database that cannot answer is a 503, anything else is returned unchanged for the global filter. */
export function toItHandoverApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  const refused = toPersonnelAccessApiException(error);
  if (refused) return refused;
  if (!(error instanceof ItHandoverRefusedError)) return toUnavailableApiException(error) ?? error;
  const answer = ANSWERS[error.code];

  return new ApiException(answer.status, { code: `IT_HANDOVER.${error.code}`, message: answer.message });
}

const example = (code: ItHandoverRefusal) => errorExampleOf(toItHandoverApiException(new ItHandoverRefusedError(code)));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const IT_HANDOVER_ERROR_EXAMPLES = {
  NOT_FOUND: example('NOT_FOUND'),
  SOURCE_CANCELLED: example('SOURCE_CANCELLED'),
  NOT_YET_YOURS: example('NOT_YET_YOURS'),
  NOTHING_TO_HAND_OVER: example('NOTHING_TO_HAND_OVER'),
  SAME_PERSON: example('SAME_PERSON'),
  TARGET_NOT_IT_ADMIN: example('TARGET_NOT_IT_ADMIN'),
} as const;
