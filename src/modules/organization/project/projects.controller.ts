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
import { toProjectSummaryWire, toProjectWire } from './project.mapper';
import {
  CreateProjectBodyDto,
  ListProjectsQueryDto,
  ProjectIdParamDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  UpdateProjectBodyDto,
} from './project.dto';
import { PROJECT_ERROR_EXAMPLES, toProjectApiException } from './project.http-errors';
import { ProjectService } from './project.service';

const AUTH_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the Super Admin keeps the projects described on department profiles.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
/** The reads (the list and one project): the same role, said for a read; the writes above keep their own wording. */
const READ_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only the Super Admin lists and reads the projects described on department profiles; the IT Admin does not.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const VALIDATION_ERROR_DESCRIPTION =
  'The request is invalid (VALIDATION_ERROR) or the project is not valid (PROJECT.INVALID).';
/** The reads: only the request itself can be invalid, the query of the list or the id of one project. */
const QUERY_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const ID_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is not a UUID (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
/** The writes: the request, or the project it describes. */
const PROJECT_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [
    VALIDATION_EXAMPLE,
    PROJECT_ERROR_EXAMPLES.PROJECT_INVALID_DEPARTMENT_NOT_FOUND,
    PROJECT_ERROR_EXAMPLES.PROJECT_INVALID_DESCRIPTION,
    PROJECT_ERROR_EXAMPLES.PROJECT_INVALID_NAME,
  ],
} as const;

/**
 * Projects described on department profiles (`US-03-06` AC-14). A project is text: not a Cost Center, no members
 * of its own and no step of any approval. The Super Admin lists, reads, adds and changes them, on an HR basis; the IT Admin does
 * not (`QĐ-87a`). Who may is decided by the policy of the service as well as by the role of the route.
 */
@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private readonly projects: ProjectService) {}

  @Get()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'projectList', summary: 'List projects' })
  @ApiSuccessResponse(ProjectListResponseDto, {
    message: 'PROJECT.LISTED',
    description:
      'A page of projects by name, optionally those a department takes part in. The description is read with GET /projects/{id}.',
  })
  @ApiErrorResponses(...READ_ERRORS, QUERY_INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListProjectsQueryDto) {
    try {
      const page = await this.projects.list(actor, query);

      return { items: page.items.map(toProjectSummaryWire), pagination: page.pagination };
    } catch (error) {
      throw toProjectApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'projectGet', summary: 'Read one project' })
  @ApiSuccessResponse(ProjectResponseDto, {
    message: 'PROJECT.FETCHED',
    description: 'The project in full, with its description and the departments that take part.',
  })
  @ApiErrorResponses(...READ_ERRORS, ID_INVALID, {
    status: HttpStatus.NOT_FOUND,
    description: 'The project does not exist (PROJECT.NOT_FOUND).',
    examples: [PROJECT_ERROR_EXAMPLES.PROJECT_NOT_FOUND],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ProjectIdParamDto) {
    try {
      return toProjectWire(await this.projects.get(actor, params.id));
    } catch (error) {
      throw toProjectApiException(error);
    }
  }

  @Post()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'projectCreate', summary: 'Add a project to a department profile' })
  @ApiSuccessResponse(ProjectResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PROJECT.CREATED',
    description: 'The project is described and appears on the profile of each department that takes part.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, PROJECT_INVALID)
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateProjectBodyDto) {
    try {
      return toProjectWire(await this.projects.create(actor, body));
    } catch (error) {
      throw toProjectApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'projectUpdate', summary: 'Update a project' })
  @ApiSuccessResponse(ProjectResponseDto, {
    message: 'PROJECT.UPDATED',
    description: 'The project has its new description, status or departments.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, PROJECT_INVALID, {
    status: HttpStatus.NOT_FOUND,
    description: 'The project does not exist (PROJECT.NOT_FOUND).',
    examples: [PROJECT_ERROR_EXAMPLES.PROJECT_NOT_FOUND],
  })
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ProjectIdParamDto,
    @Body() body: UpdateProjectBodyDto,
  ) {
    try {
      return toProjectWire(await this.projects.update(actor, params.id, body));
    } catch (error) {
      throw toProjectApiException(error);
    }
  }
}
