import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { ApiErrorResponses } from '../http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../http/decorators/api-success-response.decorator';
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

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

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

  @Get('ready')
  @ApiOperation({ operationId: 'healthGetReadiness' })
  @ApiSuccessResponse(ReadinessResponseDto, {
    description: 'Every required dependency is reachable.',
  })
  @ApiErrorResponses(
    {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'A required dependency is unavailable.',
    },
    {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      description: 'The readiness check could not be completed.',
    },
  )
  @Public()
  async getReadiness(): Promise<z.infer<typeof ReadinessDataSchema>> {
    const result = await this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma, { timeout: READINESS_TIMEOUT_MS }),
    ]);
    const details = result.details as Record<string, { status: string }>;

    return {
      status: 'ready',
      checks: Object.entries(details).map(([name, detail]) => ({ name, status: detail.status })),
    };
  }
}
