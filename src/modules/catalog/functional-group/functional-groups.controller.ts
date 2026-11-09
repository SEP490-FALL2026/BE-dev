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
  CreateFunctionalGroupBodyDto,
  FunctionalGroupIdParamDto,
  FunctionalGroupPageResponseDto,
  FunctionalGroupResponseDto,
  ListFunctionalGroupsQueryDto,
  UpdateFunctionalGroupBodyDto,
} from './functional-group.dto';
import {
  FUNCTIONAL_GROUP_ERROR_EXAMPLES as EXAMPLES,
  toFunctionalGroupApiException,
} from './functional-group.http-errors';
import { FunctionalGroupService } from './functional-group.service';
import type { FunctionalGroupRecord } from './functional-group.types';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin changes functional groups.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const INVALID_DESCRIPTION =
  'The request is invalid (VALIDATION_ERROR), the name is empty or over 200 characters (FUNCTIONAL_GROUP.NAME_INVALID) or the update names nothing (FUNCTIONAL_GROUP.UPDATE_EMPTY).';
const CREATE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: INVALID_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE, EXAMPLES.NAME_INVALID],
} as const;
const UPDATE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: INVALID_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE, EXAMPLES.NAME_INVALID, EXAMPLES.UPDATE_EMPTY],
} as const;
const NAME_TAKEN = {
  status: HttpStatus.CONFLICT,
  description: 'A group with this name exists, ignoring case, accents and spacing (FUNCTIONAL_GROUP.NAME_TAKEN).',
  examples: [EXAMPLES.NAME_TAKEN],
} as const;

const toWire = (group: FunctionalGroupRecord) => ({
  id: group.id,
  name: group.name,
  status: group.status,
  createdAt: group.createdAt.toISOString(),
  updatedAt: group.updatedAt.toISOString(),
});

/**
 * The functional groups applications are classed under (`BR-06.9`). The IT Admin keeps the list; Finance may read it.
 * A group is switched off, not deleted: there is no route that deletes one.
 */
@ApiTags('functional-groups')
@Controller({ path: 'functional-groups', version: '1' })
export class FunctionalGroupsController {
  constructor(private readonly groups: FunctionalGroupService) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'functionalGroupList', summary: 'List functional groups' })
  @ApiSuccessResponse(FunctionalGroupPageResponseDto, {
    message: 'FUNCTIONAL_GROUP.LISTED',
    description: 'A page of functional groups by name, optionally for one status.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin and Finance read functional groups.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Query() query: ListFunctionalGroupsQueryDto) {
    try {
      const page = await this.groups.list(query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toFunctionalGroupApiException(error);
    }
  }

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'functionalGroupCreate', summary: 'Create a functional group' })
  @ApiSuccessResponse(FunctionalGroupResponseDto, {
    status: HttpStatus.CREATED,
    message: 'FUNCTIONAL_GROUP.CREATED',
    description: 'The functional group exists and is active.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, CREATE_INVALID, NAME_TAKEN)
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateFunctionalGroupBodyDto) {
    try {
      return toWire(await this.groups.create(actor, body));
    } catch (error) {
      throw toFunctionalGroupApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'functionalGroupUpdate', summary: 'Rename or switch a functional group' })
  @ApiSuccessResponse(FunctionalGroupResponseDto, {
    message: 'FUNCTIONAL_GROUP.UPDATED',
    description: 'The group as it is after the change; a change of nothing is answered the same and not audited.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, UPDATE_INVALID, NAME_TAKEN, {
    status: HttpStatus.NOT_FOUND,
    description: 'The functional group does not exist (FUNCTIONAL_GROUP.NOT_FOUND).',
    examples: [EXAMPLES.NOT_FOUND],
  })
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: FunctionalGroupIdParamDto,
    @Body() body: UpdateFunctionalGroupBodyDto,
  ) {
    try {
      return toWire(await this.groups.update(actor, params.id, body));
    } catch (error) {
      throw toFunctionalGroupApiException(error);
    }
  }
}
