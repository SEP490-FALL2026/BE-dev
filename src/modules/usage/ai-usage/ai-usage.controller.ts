import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { DeviceAuthenticated } from '../../../infrastructure/security/decorators/device-authenticated.decorator';
import { CurrentDevice, type CurrentDeviceCredential } from '../../../infrastructure/security/models/current-device';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { USAGE_ERROR_EXAMPLES as EXAMPLES, toUsageApiException } from '../intake-gate/intake-gate.http-errors';
import {
  AiUsageBatchBodyDto,
  AiUsageBatchResponseDto,
  DeviceIdParamDto,
  DeviceUsagePageResponseDto,
  MyDeviceUsagePageResponseDto,
  UsageListQueryDto,
} from './ai-usage.dto';
import { AiUsageBatchService } from './ai-usage-batch.service';
import { AiUsageQueryService } from './ai-usage-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const QUERY_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id or the query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const DEVICE_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The machine is not in the register, or is not one the signed-in person ever held (DEVICE.NOT_FOUND).',
  examples: [EXAMPLES.DEVICE_NOT_FOUND],
} as const;

/** The days an AI tool was used on a company machine: sent by the collector, read by the IT Admin and by the holder. */
@ApiTags('ai-usage')
@Controller({ version: '1' })
export class AiUsageController {
  constructor(
    private readonly batches: AiUsageBatchService,
    private readonly queries: AiUsageQueryService,
  ) {}

  @Post('ai-usage-batches')
  @DeviceAuthenticated({ collectorKind: 'AI_COLLECTOR' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'aiUsageBatchCreate', summary: 'Send the days an AI tool was used' })
  @ApiSuccessResponse(AiUsageBatchResponseDto, {
    message: 'AI_USAGE_BATCH.PROCESSED',
    description:
      'The answer for each day of the batch: accepted, unchanged (the same or an older build is already kept) or rejected with the reason. Of two builds of a day the later one wins.',
  })
  @ApiErrorResponses(
    {
      status: HttpStatus.UNAUTHORIZED,
      description:
        'The credential is missing or not valid (DEVICE.CREDENTIAL_INVALID), was revoked (DEVICE.CREDENTIAL_REVOKED) or has expired (DEVICE.CREDENTIAL_EXPIRED).',
      examples: [EXAMPLES.CREDENTIAL_INVALID, EXAMPLES.CREDENTIAL_REVOKED, EXAMPLES.CREDENTIAL_EXPIRED],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The credential is not an AI collector’s (DEVICE.WRONG_COLLECTOR_KIND), the holder has not acknowledged the notice (DEVICE.NOT_ACKNOWLEDGED) or collection was stopped (DEVICE.COLLECTION_STOPPED).',
      examples: [EXAMPLES.WRONG_COLLECTOR_KIND, EXAMPLES.NOT_ACKNOWLEDGED, EXAMPLES.COLLECTION_STOPPED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The batch is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async create(@CurrentDevice() device: CurrentDeviceCredential, @Body() body: AiUsageBatchBodyDto) {
    try {
      return {
        results: await this.batches.process(device.credentialId, {
          generatedAt: new Date(body.generatedAt),
          days: body.days,
        }),
      };
    } catch (error) {
      throw toUsageApiException(error);
    }
  }

  @Get('devices/:id/usage')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'deviceUsageList', summary: 'List the days an AI tool was used on a machine' })
  @ApiSuccessResponse(DeviceUsagePageResponseDto, {
    message: 'DEVICE_USAGE.LISTED',
    description: 'The counted days of the machine, newest first, with the registration each belongs to.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the usage of a machine.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    DEVICE_NOT_FOUND,
    QUERY_INVALID,
  )
  async ofDevice(@Param() params: DeviceIdParamDto, @Query() query: UsageListQueryDto) {
    try {
      return await this.queries.ofDevice(params.id, query);
    } catch (error) {
      throw toUsageApiException(error);
    }
  }

  @Get('me/devices/:id/usage')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'myDeviceUsageList', summary: 'List the days an AI tool was used on my machine' })
  @ApiSuccessResponse(MyDeviceUsagePageResponseDto, {
    message: 'MY_DEVICE_USAGE.LISTED',
    description: 'The counted days of a machine the signed-in person holds or held, only while they held it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, DEVICE_NOT_FOUND, QUERY_INVALID)
  async ofMyDevice(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Query() query: UsageListQueryDto,
  ) {
    try {
      return await this.queries.ofMyDevice(actor.employeeId, params.id, query);
    } catch (error) {
      throw toUsageApiException(error);
    }
  }
}
