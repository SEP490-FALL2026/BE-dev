import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { toLicensingApiException } from '../mappers/licensing.http-errors';
import { SeatBaselineService } from './seat-baseline.service';

class SeatBaselineResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ closed: z.boolean(), closedAt: z.iso.datetime().nullable() })),
) {}
class SeatBaselineClosedResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({ closed: z.literal(true), closedAt: z.iso.datetime(), alreadyClosed: z.boolean() }),
  ),
) {}

const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin reads or closes the seat baseline.',
} as const;

/**
 * Whether the seat baseline (step 4 of the installation) is closed (`US-02-05` AC-6, `OI-10`). Closing is final: from then
 * on no assignment is taken without a request, whether by an import or by hand. There is no route that reopens it.
 */
@ApiTags('seat-baseline')
@Controller({ path: 'seat-baseline', version: '1' })
export class SeatBaselineController {
  constructor(private readonly baseline: SeatBaselineService) {}

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'seatBaselineGet', summary: 'Get whether the seat baseline is closed' })
  @ApiSuccessResponse(SeatBaselineResponseDto, {
    message: 'SEAT_BASELINE.FETCHED',
    description: 'Whether the baseline is closed and when.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, IT_ONLY)
  async get() {
    try {
      const state = await this.baseline.state();

      return { closed: state.closed, closedAt: state.closedAt ? state.closedAt.toISOString() : null };
    } catch (error) {
      throw toLicensingApiException(error);
    }
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'seatBaselineClose', summary: 'Close the seat baseline' })
  @ApiSuccessResponse(SeatBaselineClosedResponseDto, {
    message: 'SEAT_BASELINE.CLOSED',
    description:
      'The baseline is closed from now on and stays closed; closing again changes nothing and answers alreadyClosed.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, IT_ONLY)
  async close(@CurrentPrincipal() actor: AuthenticatedPrincipal) {
    try {
      const { closedAt, alreadyClosed } = await this.baseline.close(actor);

      return { closed: true as const, closedAt: closedAt.toISOString(), alreadyClosed };
    } catch (error) {
      throw toLicensingApiException(error);
    }
  }
}
