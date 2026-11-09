import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
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
  UsageSourceCreateBodyDto,
  UsageSourceIdParamDto,
  UsageSourceListQueryDto,
  UsageSourcePageResponseDto,
  UsageSourceResponseDto,
  UsageSourceUpdateBodyDto,
} from './vendor-source.dto';
import { USAGE_SOURCE_ERROR_EXAMPLES as EXAMPLES, toUsageSourceApiException } from './vendor-source.http-errors';
import { VendorSourceQueryService } from './vendor-source-query.service';
import { VendorSourceService } from './vendor-source.service';
import type { SourceView } from './vendor-source.types';

const AUTH_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin declares and reads the usage sources.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The source does not exist (USAGE_SOURCE.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;
const SAVE_ERRORS = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR), the application does not exist, is internal software, is retired or is a communication service whose usage is not collected (USAGE_SOURCE.APPLICATION_*, COMMUNICATION_APP), or the template does not fit the shape or the capabilities (TEMPLATE_INVALID, TEMPLATE_CAPABILITY_MISMATCH).',
  examples: [
    VALIDATION_EXAMPLE,
    EXAMPLES.APPLICATION_NOT_FOUND,
    EXAMPLES.APPLICATION_INTERNAL,
    EXAMPLES.APPLICATION_RETIRED,
    EXAMPLES.COMMUNICATION_APP,
    EXAMPLES.TEMPLATE_INVALID,
    EXAMPLES.TEMPLATE_CAPABILITY_MISMATCH,
  ],
} as const;

const toWire = (view: SourceView) => ({
  id: view.id,
  application: { id: view.applicationId, name: view.applicationName },
  name: view.name,
  identifierType: view.identifierType,
  reportShape: view.reportShape,
  template: view.template,
  timeZone: view.timeZone,
  activityDefinition: view.activityDefinition,
  definitionStrictness: view.definitionStrictness,
  evidenceDirection: view.evidenceDirection,
  capabilities: view.capabilities,
  detectableGroups: view.detectableGroups,
  limitation: view.limitation,
  canConcludeAbsence: view.canConcludeAbsence,
  createdAt: view.createdAt.toISOString(),
  updatedAt: view.updatedAt.toISOString(),
});

/**
 * Where the usage of an application comes from (`FR-4.2`, `SBF-04a`): the identifier, the shape and columns of the report, what counts as
 * activity and what the vendor can tell. Only the IT Admin: a head of department never sees the raw usage (`QĐ-101i`).
 */
@ApiTags('usage-sources')
@Controller({ path: 'usage-sources', version: '1' })
@RequireRoles('IT_ADMIN')
export class VendorSourceController {
  constructor(
    private readonly sources: VendorSourceService,
    private readonly queries: VendorSourceQueryService,
  ) {}

  @Post()
  @ApiOperation({ operationId: 'usageSourceCreate', summary: 'Declare the usage source of an application' })
  @ApiSuccessResponse(UsageSourceResponseDto, {
    status: HttpStatus.CREATED,
    message: 'USAGE_SOURCE.CREATED',
    description:
      'The source with the groups it can detect and the sentence that says what it cannot tell. The activity definition is required.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SAVE_ERRORS, {
    status: HttpStatus.CONFLICT,
    description: 'The application already has a source of this name (USAGE_SOURCE.NAME_TAKEN).',
    examples: [EXAMPLES.NAME_TAKEN],
  })
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: UsageSourceCreateBodyDto) {
    try {
      const created = await this.sources.create(actor, body);

      return toWire(await this.queries.get(created.id));
    } catch (error) {
      throw toUsageSourceApiException(error);
    }
  }

  @Get()
  @ApiOperation({ operationId: 'usageSourceList', summary: 'List the usage sources' })
  @ApiSuccessResponse(UsageSourcePageResponseDto, {
    message: 'USAGE_SOURCE.LISTED',
    description: 'A page of the sources, newest first; applicationId keeps those of one application.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: UsageSourceListQueryDto) {
    try {
      const page = await this.queries.list(query);

      return {
        items: page.items.map((view) => withoutTemplate(toWire(view))),
        pagination: page.pagination,
      };
    } catch (error) {
      throw toUsageSourceApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'usageSourceGet', summary: 'Get a usage source' })
  @ApiSuccessResponse(UsageSourceResponseDto, {
    message: 'USAGE_SOURCE.FETCHED',
    description: 'The source with the groups it can detect and what it cannot tell.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The identifier is not a UUID (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@Param() params: UsageSourceIdParamDto) {
    try {
      return toWire(await this.queries.get(params.id));
    } catch (error) {
      throw toUsageSourceApiException(error);
    }
  }

  @Patch(':id')
  @ApiOperation({ operationId: 'usageSourceUpdate', summary: 'Change a usage source for the imports that come after' })
  @ApiSuccessResponse(UsageSourceResponseDto, {
    message: 'USAGE_SOURCE.UPDATED',
    description: 'The source after the change; imports already confirmed are not judged again.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, SAVE_ERRORS, {
    status: HttpStatus.CONFLICT,
    description:
      'The name is taken (USAGE_SOURCE.NAME_TAKEN), or an import was confirmed and who the source identifies cannot change (USAGE_SOURCE.IN_USE).',
    examples: [EXAMPLES.NAME_TAKEN, EXAMPLES.IN_USE],
  })
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: UsageSourceIdParamDto,
    @Body() body: UsageSourceUpdateBodyDto,
  ) {
    try {
      await this.sources.update(actor, params.id, body);

      return toWire(await this.queries.get(params.id));
    } catch (error) {
      throw toUsageSourceApiException(error);
    }
  }
}

/** A source as a list shows it: everything but its template, which only the source itself shows. */
function withoutTemplate<T extends { template: unknown }>(wire: T): Omit<T, 'template'> {
  const item: Partial<T> = { ...wire };
  delete item.template;

  return item as Omit<T, 'template'>;
}
