import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ORGANIZATION_ERROR_EXAMPLES, toOrganizationApiException } from '../mappers/organization.http-errors';
import { DepartmentQueryService } from './department-query.service';
import { DepartmentService } from './department.service';
import {
  CreateDepartmentBodyDto,
  DeactivateDepartmentBodyDto,
  DepartmentIdParamDto,
  DepartmentMembersResponseDto,
  DepartmentPageResponseDto,
  DepartmentResponseDto,
  DepartmentTechnicalMembersResponseDto,
  DepartmentWarningsResponseDto,
  ListWarningsQueryDto,
  ListDepartmentsQueryDto,
  ListMembersQueryDto,
  UpdateDepartmentBodyDto,
} from './department.dto';
import { toDepartmentProfileWire, toDepartmentWire } from './department.mapper';
import {
  AUTH_ERRORS,
  NOT_FOUND,
  SUPER_ADMIN_ONLY,
  VALIDATION_ERROR,
  VALIDATION_ERROR_DESCRIPTION,
} from './department.responses';

const CREATE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [
    VALIDATION_EXAMPLE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_IT_ADMIN_INVALID,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_NAME_INVALID,
  ],
} as const;
const UPDATE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [
    VALIDATION_EXAMPLE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_IT_ADMIN_INVALID,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_NAME_INVALID,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_UPDATE_EMPTY,
  ],
} as const;
/**
 * Department profiles (`US-03-06`). The Super Admin keeps them, on an HR basis, and reads them in full (`QĐ-87a`); the IT Admin
 * changes nothing and reads only the departments they are in charge of or stand in for; a department head reads the one they head
 * and the list of its people (`US-01-02` AC-7); Finance and employees change nothing here (AC-16). Who may do what is decided
 * by the policy of the services, not only by the roles of these routes (`F13`). There is no route that merges or splits departments
 * (AC-20) or deletes one: a department is retired. Every change answers with the profile as it is after the change.
 */
@ApiTags('departments')
@Controller({ version: '1' })
export class DepartmentsController {
  constructor(
    private readonly queries: DepartmentQueryService,
    private readonly departments: DepartmentService,
  ) {}

  private async profileAfter(actor: AuthenticatedPrincipal, id: string) {
    return toDepartmentProfileWire(await this.queries.profile(actor, id));
  }

  @Get('departments')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'departmentList', summary: 'List departments' })
  @ApiSuccessResponse(DepartmentPageResponseDto, {
    message: 'DEPARTMENT.LISTED',
    description:
      'A page of departments in code order, each with its Cost Center (null while Finance has not created one: its warnings then say MISSING_COST_CENTER), its head today, its people count and its warnings. The Super Admin reads all; an IT Admin only the departments they are in charge of or stand in for.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, VALIDATION_ERROR)
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ListDepartmentsQueryDto) {
    try {
      const page = await this.queries.list(principal, query);

      return { items: page.items.map(toDepartmentWire), pagination: page.pagination };
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentCreate', summary: 'Create a department' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEPARTMENT.CREATED',
    description:
      'The department exists with no Cost Center (Finance creates one for it) and nobody heading it yet. warnings says what is still missing, among them MISSING_COST_CENTER: the finance configuration is incomplete.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, CREATE_INVALID, {
    status: HttpStatus.CONFLICT,
    description: 'The code is taken (DEPARTMENT.CODE_TAKEN).',
    examples: [ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_CODE_TAKEN],
  })
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateDepartmentBodyDto) {
    try {
      const id = await this.departments.create(actor, {
        code: body.code,
        name: body.name,
        functionDescription: body.function,
        itAdminEmployeeId: body.itAdminEmployeeId,
        hrBasis: body.hrBasis,
      });

      return await this.profileAfter(actor, id);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get('departments/:id')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'departmentGet', summary: 'Get a department profile' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.FETCHED',
    description:
      'The profile: Cost Center (null while it has none), IT Admin in charge, head today and before, the successor named to take over, people count, projects, warnings.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.FORBIDDEN,
    description:
      'A department head asking about a department that is not theirs (DEPARTMENT.OUT_OF_SCOPE), or a role that reads none.',
    examples: [FORBIDDEN_EXAMPLE, ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_OUT_OF_SCOPE],
  })
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param() params: DepartmentIdParamDto) {
    try {
      return toDepartmentProfileWire(await this.queries.profile(principal, params.id));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Patch('departments/:id')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentUpdate', summary: 'Update a department profile' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.UPDATED',
    description:
      'The name, the description or the IT Admin in charge changed, on the HR basis given. The Cost Center and the people do not.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, UPDATE_INVALID, NOT_FOUND)
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: UpdateDepartmentBodyDto,
  ) {
    try {
      await this.departments.update(actor, params.id, {
        name: body.name,
        functionDescription: body.function,
        itAdminEmployeeId: body.itAdminEmployeeId,
        hrBasis: body.hrBasis,
      });

      return await this.profileAfter(actor, params.id);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments/:id/deactivate')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentDeactivate', summary: 'Retire a department' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.DEACTIVATED',
    description:
      'The department is retired, on the HR basis given: it takes no new member or head. If it is already retired, the answer is the same.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description:
      'Something still keeps it in use (DEPARTMENT.IN_USE; details lists each group with its first things and its total): the people in it, the service accounts it owns, open work (Requests not over, personnel events waiting, open tasks) and the subscriptions or purchases it owns that still owe a payment.',
    examples: [ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_IN_USE],
  })
  async deactivate(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: DeactivateDepartmentBodyDto,
  ) {
    try {
      await this.departments.deactivate(actor, params.id, { hrBasis: body.hrBasis });

      return await this.profileAfter(actor, params.id);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get('departments/:id/employees')
  @RequireRoles('SUPER_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'departmentMemberList', summary: 'List the members of a department' })
  @ApiSuccessResponse(DepartmentMembersResponseDto, {
    message: 'DEPARTMENT.MEMBERS_LISTED',
    description:
      'The people in the department today: code, name, status, work state (working, on long leave, handing over), whether they have a work email, and since when. No email, contract or finance data. For the Super Admin and for the head of that department; an IT Admin reads the technical minimum from GET /departments/{id}/technical-members.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.FORBIDDEN,
    description: 'A department head asking about a department that is not theirs, or a role that reads none.',
    examples: [FORBIDDEN_EXAMPLE, ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_OUT_OF_SCOPE],
  })
  async members(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Query() query: ListMembersQueryDto,
  ) {
    try {
      return await this.queries.members(principal, params.id, query);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get('departments/:id/technical-members')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'departmentTechnicalMemberList',
    summary: 'List the people of a department for a technical task',
  })
  @ApiSuccessResponse(DepartmentTechnicalMembersResponseDto, {
    message: 'DEPARTMENT.TECHNICAL_MEMBERS_LISTED',
    description:
      'What an IT Admin needs of the people in a department they are in charge of or stand in for: id, code, name, department, work state and the first day in the department. No email, kind of staff, hire date, basis or verification.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin reads this.',
    examples: [FORBIDDEN_EXAMPLE],
  })
  async technicalMembers(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Query() query: ListMembersQueryDto,
  ) {
    try {
      return await this.queries.technicalMembers(principal, params.id, query);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get('department-warnings')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'departmentWarningList', summary: 'List department warnings' })
  @ApiSuccessResponse(DepartmentWarningsResponseDto, {
    message: 'DEPARTMENT.WARNINGS_LISTED',
    description:
      'One page of the active departments that miss a head or a usable IT Admin in charge, by department code then warning: all of them for the Super Admin, who gives them a head and an IT Admin; for an IT Admin, those they are in charge of or stand in for. The list is paged: without page and pageSize the answer holds the first 20 only. pagination.totalItems counts every warning and pagination.totalPages the pages; ask for page 2 up to totalPages (pageSize up to 100) to read the rest.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin and the IT Admin see department warnings.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The paging query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async warnings(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ListWarningsQueryDto) {
    try {
      return await this.queries.warnings(principal, query);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
