import { Body, Controller, Get, HttpStatus, Param, Put, Query } from '@nestjs/common';
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
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  ListToolsetsQueryDto,
  MyToolsetResponseDto,
  SetToolsetBodyDto,
  SetToolsetResponseDto,
  ToolsetHistoryQueryDto,
  ToolsetPageResponseDto,
  ToolsetPairParamDto,
  ToolsetResponseDto,
} from './standard-toolset.dto';
import { STANDARD_TOOLSET_ERROR_EXAMPLES as EXAMPLES, toToolsetApiException } from './standard-toolset.http-errors';
import { StandardToolsetService, type ToolsetView } from './standard-toolset.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the IT Admin, or a department head for their own department (DEPARTMENT.OUT_OF_SCOPE), reads the toolsets of a department.',
  examples: [FORBIDDEN_EXAMPLE, EXAMPLES.OUT_OF_SCOPE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The department or the job title does not exist (DEPARTMENT.NOT_FOUND, JOB_TITLE.NOT_FOUND).',
  examples: [EXAMPLES.DEPARTMENT_NOT_FOUND, EXAMPLES.JOB_TITLE_NOT_FOUND],
} as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id or the query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

const toWire = (view: ToolsetView) => ({ ...view, changedAt: view.changedAt.toISOString() });

/**
 * The standard toolsets of a department and job title (`US-04-10`). The IT Admin sets them, always with a reason, and each
 * change is a version that is never rewritten; the department head reads those of their own department and an employee
 * their own. Changing a toolset grants and revokes nothing, nothing suggests tools by AI or by usage, and nothing deletes a
 * toolset: there is no route that does.
 */
@ApiTags('standard-toolsets')
@Controller({ path: 'standard-toolsets', version: '1' })
export class StandardToolsetsController {
  constructor(private readonly toolsets: StandardToolsetService) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'standardToolsetList', summary: 'List the standard toolsets' })
  @ApiSuccessResponse(ToolsetPageResponseDto, {
    message: 'STANDARD_TOOLSET.LISTED',
    description:
      'The pairs that have a toolset, with the current setting of each; a department head names their own department.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, INVALID)
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ListToolsetsQueryDto) {
    try {
      const page = await this.toolsets.list(principal, query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toToolsetApiException(error);
    }
  }

  @Get('mine')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'standardToolsetMine',
    summary: 'Get the standard toolset of my department and job title',
  })
  @ApiSuccessResponse(MyToolsetResponseDto, {
    message: 'STANDARD_TOOLSET.FETCHED',
    description:
      'The toolset of the department and the job title the signed-in employee has today; the placement and the toolset are null when there is none.',
  })
  @ApiErrorResponses(...AUTH_ERRORS)
  async mine(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    try {
      const mine = await this.toolsets.mine(principal);

      return { ...mine, toolset: mine.toolset ? toWire(mine.toolset) : null };
    } catch (error) {
      throw toToolsetApiException(error);
    }
  }

  @Get(':departmentId/:jobTitleId')
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({
    operationId: 'standardToolsetGet',
    summary: 'Get the standard toolset of a department and job title',
  })
  @ApiSuccessResponse(ToolsetResponseDto, {
    message: 'STANDARD_TOOLSET.FETCHED',
    description: 'The current toolset of the pair, or null when it has none.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, INVALID)
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param() params: ToolsetPairParamDto) {
    try {
      const toolset = await this.toolsets.get(principal, params.departmentId, params.jobTitleId);

      return { toolset: toolset ? toWire(toolset) : null };
    } catch (error) {
      throw toToolsetApiException(error);
    }
  }

  @Put(':departmentId/:jobTitleId')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'standardToolsetSet',
    summary: 'Set the standard toolset of a department and job title',
  })
  @ApiSuccessResponse(SetToolsetResponseDto, {
    message: 'STANDARD_TOOLSET.SET',
    description:
      'The plans are the toolset of the pair from now on; a change is a new version and changed says so. It grants and revokes nothing.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin sets a standard toolset.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or refused: STANDARD_TOOLSET.REASON_REQUIRED, PLAN_NOT_FOUND (details.planIds), PLAN_DUPLICATE, TOO_MANY_PLANS, JOB_TITLE_INACTIVE or DEPARTMENT_INACTIVE (a new pair only).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.REASON_REQUIRED,
        EXAMPLES.PLAN_NOT_FOUND,
        EXAMPLES.PLAN_DUPLICATE,
        EXAMPLES.TOO_MANY_PLANS,
        EXAMPLES.JOB_TITLE_INACTIVE,
        EXAMPLES.DEPARTMENT_INACTIVE,
      ],
    },
  )
  async set(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ToolsetPairParamDto,
    @Body() body: SetToolsetBodyDto,
  ) {
    try {
      const { toolset, changed } = await this.toolsets.set(actor, params.departmentId, params.jobTitleId, body);

      return { toolset: toWire(toolset), changed };
    } catch (error) {
      throw toToolsetApiException(error);
    }
  }

  @Get(':departmentId/:jobTitleId/history')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'standardToolsetHistory', summary: 'List the settings of a standard toolset' })
  @ApiSuccessResponse(ToolsetPageResponseDto, {
    message: 'STANDARD_TOOLSET.HISTORY_LISTED',
    description: 'A page of the settings, newest first, each with who set it, why and when. None is ever changed.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin reads the history.', examples: [FORBIDDEN_EXAMPLE] },
    NOT_FOUND,
    INVALID,
  )
  async history(@Param() params: ToolsetPairParamDto, @Query() query: ToolsetHistoryQueryDto) {
    try {
      const page = await this.toolsets.history(params.departmentId, params.jobTitleId, query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toToolsetApiException(error);
    }
  }
}
