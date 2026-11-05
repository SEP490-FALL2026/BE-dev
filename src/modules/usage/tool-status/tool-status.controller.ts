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
import { DeviceIdParamDto } from '../ai-usage/ai-usage.dto';
import { USAGE_ERROR_EXAMPLES as EXAMPLES, toUsageApiException } from '../intake-gate/intake-gate.http-errors';
import {
  ToolStatusBatchBodyDto,
  ToolStatusBatchResponseDto,
  ToolStatusListQueryDto,
  ToolStatusPageResponseDto,
} from './tool-status.dto';
import { ToolStatusQueryService } from './tool-status-query.service';
import { ToolStatusSnapshotService } from './tool-status-snapshot.service';

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

/** The login and quota of the AI tools on a company machine: sent by the collector, read by the IT Admin and by the holder. */
@ApiTags('ai-tool-status')
@Controller({ version: '1' })
export class ToolStatusController {
  constructor(
    private readonly snapshots: ToolStatusSnapshotService,
    private readonly queries: ToolStatusQueryService,
  ) {}

  @Post('ai-tool-status-snapshots')
  @DeviceAuthenticated({ collectorKind: 'AI_COLLECTOR' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'aiToolStatusSnapshotCreate', summary: 'Send the login and quota of AI tools' })
  @ApiSuccessResponse(ToolStatusBatchResponseDto, {
    message: 'AI_TOOL_STATUS_SNAPSHOT.PROCESSED',
    description: 'The answer for each snapshot: accepted, unchanged (already kept) or rejected with the reason.',
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
        'The credential is not an AI collector’s (DEVICE.WRONG_COLLECTOR_KIND), the holder has not acknowledged the notice (DEVICE.NOT_ACKNOWLEDGED), collection was stopped (DEVICE.COLLECTION_STOPPED), or the notice in force that names the status of tools is not acknowledged (DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED).',
      examples: [
        EXAMPLES.WRONG_COLLECTOR_KIND,
        EXAMPLES.NOT_ACKNOWLEDGED,
        EXAMPLES.COLLECTION_STOPPED,
        EXAMPLES.TOOL_STATUS_NOT_ACKNOWLEDGED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async create(@CurrentDevice() device: CurrentDeviceCredential, @Body() body: ToolStatusBatchBodyDto) {
    try {
      const results = await this.snapshots.process(
        device.credentialId,
        body.snapshots.map((snapshot) => ({
          ...snapshot,
          observedAt: new Date(snapshot.observedAt),
          quota: {
            status: snapshot.quota.status,
            windows: snapshot.quota.windows.map((window) => ({
              ...window,
              resetsAt: window.resetsAt ? new Date(window.resetsAt) : null,
            })),
          },
        })),
      );

      return { results: results.map((result) => ({ ...result, observedAt: result.observedAt.toISOString() })) };
    } catch (error) {
      throw toUsageApiException(error);
    }
  }

  @Get('devices/:id/tool-status')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'deviceToolStatusList', summary: 'List the latest tool status of a machine' })
  @ApiSuccessResponse(ToolStatusPageResponseDto, {
    message: 'DEVICE_TOOL_STATUS.LISTED',
    description: 'The latest login and quota of each tool, a row for each window.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the tool status of a machine.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    DEVICE_NOT_FOUND,
    QUERY_INVALID,
  )
  async ofDevice(@Param() params: DeviceIdParamDto, @Query() query: ToolStatusListQueryDto) {
    try {
      return await this.queries.ofDevice(params.id, query);
    } catch (error) {
      throw toUsageApiException(error);
    }
  }

  @Get('me/devices/:id/tool-status')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'myDeviceToolStatusList', summary: 'List the latest tool status of my machine' })
  @ApiSuccessResponse(ToolStatusPageResponseDto, {
    message: 'MY_DEVICE_TOOL_STATUS.LISTED',
    description:
      'The latest login and quota of each tool on a machine the signed-in person holds or held, only while they held it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, DEVICE_NOT_FOUND, QUERY_INVALID)
  async ofMyDevice(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Query() query: ToolStatusListQueryDto,
  ) {
    try {
      return await this.queries.ofMyDevice(actor.employeeId, params.id, query);
    } catch (error) {
      throw toUsageApiException(error);
    }
  }
}
