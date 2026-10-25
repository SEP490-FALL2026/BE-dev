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
  JobTitleIdParamDto,
  JobTitleNameBodyDto,
  JobTitlePageResponseDto,
  JobTitleResponseDto,
  ListJobTitlesQueryDto,
} from './job-title.dto';
import { JobTitleService } from './job-title.service';
import { ORGANIZATION_ERROR_EXAMPLES, toOrganizationApiException } from '../mappers/organization.http-errors';
import { JobTitleRecord } from './job-title.types';

const COMMON_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin may maintain the job title catalogue.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;

const VALIDATION_ERROR_DESCRIPTION = 'The request is invalid (VALIDATION_ERROR), or the name is empty or too long.';

/** The routes that take no name: only the request itself can be invalid. */
const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE],
} as const;

/** The routes that take a name: the request, or the name once trimmed. */
const NAME_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [
    VALIDATION_EXAMPLE,
    ORGANIZATION_ERROR_EXAMPLES.JOB_TITLE_NAME_REQUIRED,
    ORGANIZATION_ERROR_EXAMPLES.JOB_TITLE_NAME_TOO_LONG,
  ],
} as const;

const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The job title does not exist.',
  examples: [ORGANIZATION_ERROR_EXAMPLES.JOB_TITLE_NOT_FOUND],
} as const;

function toWire(title: JobTitleRecord) {
  return {
    id: title.id,
    name: title.name,
    status: title.status,
    createdAt: title.createdAt.toISOString(),
    updatedAt: title.updatedAt.toISOString(),
  };
}

/**
 * The job title catalogue (`US-02-07`). IT Admin only: the Super Admin does no business work (`SoD-1`) and
 * every other role is refused. There is no route that deletes a title (AC-9); a title that is no longer wanted
 * is deactivated.
 */
@ApiTags('job-titles')
@Controller({ path: 'job-titles', version: '1' })
@RequireRoles('IT_ADMIN')
export class JobTitlesController {
  constructor(private readonly titles: JobTitleService) {}

  @Get()
  @ApiOperation({ operationId: 'jobTitleList', summary: 'List job titles' })
  @ApiSuccessResponse(JobTitlePageResponseDto, {
    message: 'JOB_TITLE.LISTED',
    description: 'A page of job titles in name order, optionally by status or a literal search of the name.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, VALIDATION_ERROR)
  async list(@Query() query: ListJobTitlesQueryDto) {
    try {
      const page = await this.titles.list(query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post()
  @ApiOperation({ operationId: 'jobTitleCreate', summary: 'Add a job title' })
  @ApiSuccessResponse(JobTitleResponseDto, {
    status: HttpStatus.CREATED,
    message: 'JOB_TITLE.CREATED',
    description: 'The title was added and is active.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NAME_INVALID, {
    status: HttpStatus.CONFLICT,
    description:
      'Another title, active or not, already has this name once case and whitespace are ignored (JOB_TITLE.NAME_TAKEN; details.conflict names it).',
    examples: [ORGANIZATION_ERROR_EXAMPLES.JOB_TITLE_NAME_TAKEN],
  })
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: JobTitleNameBodyDto) {
    try {
      return toWire(await this.titles.create(actor, body.name));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Patch(':id')
  @ApiOperation({ operationId: 'jobTitleRename', summary: 'Rename a job title' })
  @ApiSuccessResponse(JobTitleResponseDto, {
    message: 'JOB_TITLE.RENAMED',
    description: 'The title has its new name; everyone who holds it keeps it.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NAME_INVALID, NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description: 'Another title already has this name (JOB_TITLE.NAME_TAKEN; details.conflict names it).',
    examples: [ORGANIZATION_ERROR_EXAMPLES.JOB_TITLE_NAME_TAKEN],
  })
  async rename(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: JobTitleIdParamDto,
    @Body() body: JobTitleNameBodyDto,
  ) {
    try {
      return toWire(await this.titles.rename(actor, params.id, body.name));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post(':id/deactivate')
  @ApiOperation({ operationId: 'jobTitleDeactivate', summary: 'Stop using a job title' })
  @ApiSuccessResponse(JobTitleResponseDto, {
    message: 'JOB_TITLE.DEACTIVATED',
    description:
      'The title is inactive; nobody who holds it loses it. If it is already inactive, the answer is the same.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, VALIDATION_ERROR, NOT_FOUND)
  async deactivate(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: JobTitleIdParamDto) {
    try {
      return toWire(await this.titles.deactivate(actor, params.id));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post(':id/reactivate')
  @ApiOperation({ operationId: 'jobTitleReactivate', summary: 'Use a job title again' })
  @ApiSuccessResponse(JobTitleResponseDto, {
    message: 'JOB_TITLE.REACTIVATED',
    description: 'The title is active again. If it is already active, the answer is the same.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, VALIDATION_ERROR, NOT_FOUND)
  async reactivate(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: JobTitleIdParamDto) {
    try {
      return toWire(await this.titles.reactivate(actor, params.id));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
