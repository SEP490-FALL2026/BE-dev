import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AllowlistEntryPageResponseDto,
  AllowlistListQueryDto,
  AllowlistVersionBodyDto,
  AllowlistVersionResponseDto,
} from './allowlist.dto';
import { ALLOWLIST_ERROR_EXAMPLES as EXAMPLES, toAllowlistApiException } from './allowlist.http-errors';
import { AI_TOOL_EXPERIMENTAL } from './allowlist.policy';
import { AllowlistPublishService } from './allowlist-publish.service';
import { AllowlistQueryService } from './allowlist-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** Which AI tools a collector on a company machine may report, as the IT Admin keeps it. */
@ApiTags('collector-allowlist')
@Controller({ version: '1' })
@RequireRoles('IT_ADMIN')
export class AllowlistController {
  constructor(
    private readonly publisher: AllowlistPublishService,
    private readonly queries: AllowlistQueryService,
  ) {}

  @Post('collector-allowlist-versions')
  @ApiOperation({
    operationId: 'collectorAllowlistVersionCreate',
    summary: 'Publish a version of the collector allowlist',
  })
  @ApiSuccessResponse(AllowlistVersionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'COLLECTOR_ALLOWLIST.PUBLISHED',
    description:
      'The new version, numbered after the last, with the tools it lists. A day is judged by the versions in force on that day.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin publishes the allowlist.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The list is the same as the one in force (COLLECTOR_ALLOWLIST.UNCHANGED).',
      examples: [EXAMPLES.UNCHANGED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), an application does not exist (COLLECTOR_ALLOWLIST.APPLICATION_NOT_FOUND), or is one whose usage is not collected (COLLECTOR_ALLOWLIST.APPLICATION_NOT_ELIGIBLE).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.APPLICATION_NOT_FOUND, EXAMPLES.APPLICATION_NOT_ELIGIBLE],
    },
  )
  async publish(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: AllowlistVersionBodyDto) {
    try {
      const version = await this.publisher.publish(actor, body);

      return {
        id: version.id,
        versionNumber: version.versionNumber,
        publishedAt: version.publishedAt.toISOString(),
        entries: version.entries.map((entry) => ({
          kind: entry.kind,
          key: entry.tool,
          application: { id: entry.applicationId, name: version.applications.get(entry.applicationId) ?? '' },
          experimental: AI_TOOL_EXPERIMENTAL.has(entry.tool),
        })),
      };
    } catch (error) {
      throw toAllowlistApiException(error);
    }
  }

  @Get('collector-allowlist-entries')
  @ApiOperation({ operationId: 'collectorAllowlistEntryList', summary: 'List the tools on the collector allowlist' })
  @ApiSuccessResponse(AllowlistEntryPageResponseDto, {
    message: 'COLLECTOR_ALLOWLIST.ENTRIES_LISTED',
    description:
      'The tools of the version in force, each with its application and whether reading it is still experimental.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the allowlist.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Query() query: AllowlistListQueryDto) {
    try {
      return await this.queries.list(query);
    } catch (error) {
      throw toAllowlistApiException(error);
    }
  }
}
