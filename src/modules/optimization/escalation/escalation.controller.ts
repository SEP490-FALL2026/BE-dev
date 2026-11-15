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
import { EscalationBodyDto, EscalationResponseDto, idempotencyKeySchema } from './escalation.dto';
import { ESCALATION_ERROR_EXAMPLES, toEscalationApiException } from './escalation.http-errors';
import { toEscalationWire } from './escalation.mapper';
import { EscalationService } from './escalation.service';

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
      'One result for each recommendation named, in order: pushed to the queue of the head (or waiting for one) or left as it was with the reason. A recommendation that cannot be pushed is not an error.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin pushes a recommendation to a head.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The Idempotency-Key was used for another batch (GHOST_SEAT.ESCALATION_KEY_REUSED).',
      examples: [ESCALATION_ERROR_EXAMPLES.KEY_REUSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body or the Idempotency-Key is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
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
          idempotencyKey: key.data,
        }),
      );
    } catch (error) {
      throw toEscalationApiException(error);
    }
  }
}
