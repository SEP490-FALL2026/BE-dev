import { Body, Controller, Headers, HttpStatus, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { VALIDATION_ERROR_BODY } from '../../../infrastructure/http/pipes/zod-validation.pipe';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CHECKLIST_ERROR_EXAMPLES, toChecklistApiException } from '../../policies/public/policy-checklist.http-errors';
import { EscalationBodyDto, EscalationResponseDto, idempotencyKeySchema } from './escalation.dto';
import { ESCALATION_ERROR_EXAMPLES, toEscalationApiException } from './escalation.http-errors';
import { toEscalationWire } from './escalation.mapper';
import { EscalationService } from './escalation.service';

const KEY_OR_VERSION = {
  status: HttpStatus.CONFLICT,
  description:
    'The Idempotency-Key was used for another batch (GHOST_SEAT.ESCALATION_KEY_REUSED), or the policy of the checklist was changed since the IT Admin was shown it (POLICY.VERSION_CHANGED).',
  examples: [ESCALATION_ERROR_EXAMPLES.KEY_REUSED, CHECKLIST_ERROR_EXAMPLES.VERSION_CHANGED],
} as const;
const NOT_PUSHABLE = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The body or the Idempotency-Key is invalid (VALIDATION_ERROR), the checklist lacks an answer (POLICY.CHECKLIST_INCOMPLETE), or an answer is No (POLICY.CHECKLIST_HAS_NO, with the questions answered No in details.items): the batch is refused, no key is taken and the watch stays as it was.',
  examples: [VALIDATION_EXAMPLE, CHECKLIST_ERROR_EXAMPLES.INCOMPLETE, CHECKLIST_ERROR_EXAMPLES.HAS_NO],
} as const;

/** The early push of a watch to the head of the department, for the IT Admin. */
@ApiTags('ghost-seats')
@Controller({ path: 'ghost-seat-recommendations/escalations', version: '1' })
@RequireRoles('IT_ADMIN')
export class EscalationController {
  constructor(private readonly escalations: EscalationService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'A key the caller makes once for this batch (16 to 128 letters, digits, - or _); sending the same batch with it again answers what was done, another batch with it is refused.',
  })
  @ApiOperation({
    operationId: 'ghostSeatEscalationCreate',
    summary: 'Push watch-tier recommendations to the head of the department',
  })
  @ApiSuccessResponse(EscalationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'GHOST_SEAT_ESCALATION.CREATED',
    description:
      'One result for each recommendation named, in order: pushed to the queue of the head (or waiting for one) or left as it was with the reason. A recommendation that cannot be pushed is not an error. The checklist of the policy in force is answered once for the batch and kept for each recommendation pushed; an answer No refuses the whole batch and the watch stays as it was.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin pushes a recommendation to a head.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    KEY_OR_VERSION,
    NOT_PUSHABLE,
  )
  async create(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Body() body: EscalationBodyDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const key = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!key.success) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
        ...VALIDATION_ERROR_BODY,
        details: { issues: [{ code: 'invalid_format', path: 'Idempotency-Key' }] },
      });
    }
    try {
      return toEscalationWire(
        await this.escalations.escalate(actor, {
          recommendationIds: body.recommendationIds,
          note: body.note,
          checklist: body.checklist,
          idempotencyKey: key.data,
        }),
      );
    } catch (error) {
      throw toChecklistApiException(error) ?? toEscalationApiException(error);
    }
  }
}
