import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { toProjectSummaryWire, toProjectWire } from '../mappers/project.mapper';
import {
  CreateProjectBodyDto,
  ListProjectsQueryDto,
  ProjectIdParamDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  UpdateProjectBodyDto,
} from './project.dto';
import { toOrganizationApiException } from '../mappers/organization.http-errors';
import { ProjectService } from './project.service';

const AUTH_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin keeps the projects described on department profiles.',
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR) or the project is not valid (PROJECT.INVALID).',
} as const;

/**
 * Projects described on department profiles (`US-03-06` AC-14). A project is text: not a Cost Center, no members
 * of its own and no step of any approval.
 */
@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private readonly projects: ProjectService) {}

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'projectList', summary: 'List projects' })
  @ApiSuccessResponse(ProjectListResponseDto, {
    message: 'PROJECT.LISTED',
    description:
      'A page of projects by name, optionally those a department takes part in. The description is read with GET /projects/{id}.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR)
  async list(@Query() query: ListProjectsQueryDto) {
    try {
      const page = await this.projects.list(query);

      return { items: page.items.map(toProjectSummaryWire), pagination: page.pagination };
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'projectGet', summary: 'Read one project' })
  @ApiSuccessResponse(ProjectResponseDto, {
    message: 'PROJECT.FETCHED',
    description: 'The project in full, with its description and the departments that take part.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, {
    status: HttpStatus.NOT_FOUND,
    description: 'The project does not exist (PROJECT.NOT_FOUND).',
  })
  async get(@Param() params: ProjectIdParamDto) {
    try {
      return toProjectWire(await this.projects.get(params.id));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'projectCreate', summary: 'Add a project to a department profile' })
  @ApiSuccessResponse(ProjectResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PROJECT.CREATED',
    description: 'The project is described and appears on the profile of each department that takes part.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR)
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateProjectBodyDto) {
    try {
      return toProjectWire(await this.projects.create(actor, body));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'projectUpdate', summary: 'Update a project' })
  @ApiSuccessResponse(ProjectResponseDto, {
    message: 'PROJECT.UPDATED',
    description: 'The project has its new description, status or departments.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, {
    status: HttpStatus.NOT_FOUND,
    description: 'The project does not exist (PROJECT.NOT_FOUND).',
  })
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ProjectIdParamDto,
    @Body() body: UpdateProjectBodyDto,
  ) {
    try {
      return toProjectWire(await this.projects.update(actor, params.id, body));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
