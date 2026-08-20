import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ApiErrorResponses } from '../http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../http/decorators/api-success-response.decorator';
import { successEnvelopeSchema } from '../http/dto/success-envelope.dto';
import { Public } from '../security/decorators/public.decorator';

const HealthDataSchema = z.strictObject({ status: z.literal('ok') });
class HealthResponseDto extends createZodDto(successEnvelopeSchema(HealthDataSchema)) {}

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get('live')
  @ApiOperation({ operationId: 'healthGetLiveness' })
  @ApiSuccessResponse(HealthResponseDto, {
    description: 'The API process is alive.',
  })
  @ApiErrorResponses({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'The liveness check could not be completed.',
  })
  @Public()
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
