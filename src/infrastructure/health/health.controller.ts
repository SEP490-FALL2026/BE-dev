import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { ApiErrorResponses, fallbackExample } from '../http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../http/decorators/api-success-response.decorator';
import { createZodDto } from '../http/dto/zod-dto';
import { ApiException } from '../http/errors/api.exception';
import { successEnvelopeSchema } from '../http/dto/success-envelope.dto';
import { Public } from '../security/decorators/public.decorator';

const HealthDataSchema = z.strictObject({ status: z.literal('ok') });
class HealthResponseDto extends createZodDto(successEnvelopeSchema(HealthDataSchema)) {}

const ReadinessDataSchema = z.strictObject({
  status: z.literal('ready'),
  checks: z.array(z.strictObject({ name: z.string(), status: z.string() })),
});
class ReadinessResponseDto extends createZodDto(successEnvelopeSchema(ReadinessDataSchema)) {}

const READINESS_TIMEOUT_MS = 1_500;

/** The readiness answer when the database does not reply; the document shows exactly this body. */
const DEPENDENCY_UNAVAILABLE = Object.freeze({
  code: 'SERVICE_UNAVAILABLE',
  message: 'A required dependency is unavailable.',
});
/** Any other failure reaches the filter as an unexpected error. */
const CHECK_FAILED_EXAMPLE = fallbackExample(HttpStatus.INTERNAL_SERVER_ERROR);

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get('live')
  @ApiOperation({ operationId: 'healthGetLiveness', summary: 'Check that the process is running' })
  @ApiSuccessResponse(HealthResponseDto, {
    message: 'HEALTH.LIVENESS_CHECKED',
    description: 'The API process is alive.',
  })
  @ApiErrorResponses({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'The liveness check could not be completed.',
    examples: [CHECK_FAILED_EXAMPLE],
  })
  @Public()
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ operationId: 'healthGetReadiness', summary: 'Check that the database is reachable' })
  @ApiSuccessResponse(ReadinessResponseDto, {
    message: 'HEALTH.READINESS_CHECKED',
    description: 'Every required dependency is reachable.',
  })
  @ApiErrorResponses(
    {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'A required dependency is unavailable.',
      examples: [DEPENDENCY_UNAVAILABLE],
    },
    {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      description: 'The readiness check could not be completed.',
      examples: [CHECK_FAILED_EXAMPLE],
    },
  )
  @Public()
  async getReadiness(): Promise<z.infer<typeof ReadinessDataSchema>> {
    let result;
    try {
      result = await this.health.check([
        () => this.prismaHealth.pingCheck('database', this.prisma, { timeout: READINESS_TIMEOUT_MS }),
      ]);
    } catch (error) {
      // Terminus reports a failed check as a bare 503; give it the availability code of the contract (R-12).
      if (!(error instanceof ServiceUnavailableException)) throw error;
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, DEPENDENCY_UNAVAILABLE);
    }
    const details = result.details as Record<string, { status: string }>;

    return {
      status: 'ready',
      checks: Object.entries(details).map(([name, detail]) => ({ name, status: detail.status })),
    };
  }
}
