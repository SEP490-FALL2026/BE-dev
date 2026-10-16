import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { DepartmentProfileView, DepartmentService, DepartmentView } from './department.service';
import {
  AssignHeadBodyDto,
  CreateDepartmentBodyDto,
  DepartmentIdParamDto,
  DepartmentMembersResponseDto,
  DepartmentPageResponseDto,
  DepartmentResponseDto,
  DepartmentWarningsResponseDto,
  ListDepartmentsQueryDto,
  ListMembersQueryDto,
  UpdateDepartmentBodyDto,
  VacateHeadBodyDto,
} from './dto/department.dto';
import { toOrganizationApiException } from './organization.http-errors';

const AUTH_ERRORS = [
  { status: HttpStatus.UNAUTHORIZED, description: 'Authentication is required or the token is no longer valid.' },
  {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description:
      'Authentication or the service is temporarily unavailable (TOKEN_VERIFICATION_UNAVAILABLE from the guard, SERVICE_UNAVAILABLE after it).',
  },
] as const;

const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin changes department data (US-03-06 AC-16).',
} as const;
const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR) or a rule of the department refuses it; details name the reason.',
} as const;
const NOT_FOUND = { status: HttpStatus.NOT_FOUND, description: 'The department does not exist.' } as const;

function toWire(view: DepartmentView) {
  return {
    id: view.id,
    code: view.code,
    name: view.name,
    function: view.functionDescription,
    status: view.status,
    costCenter: view.costCenter,
    itAdmin: view.itAdmin
      ? {
          employeeId: view.itAdmin.employeeId,
          employeeCode: view.itAdmin.employeeCode,
          fullName: view.itAdmin.fullName,
          usable: view.itAdminUsable,
        }
      : null,
    head: view.head,
    memberCount: view.memberCount,
    warnings: view.warnings,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    deactivatedAt: view.deactivatedAt ? view.deactivatedAt.toISOString() : null,
  };
}

export function toProjectWire(project: DepartmentProfileView['projects'][number]) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    departments: project.departments,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toProfileWire(view: DepartmentProfileView) {
  return { ...toWire(view), headHistory: view.headHistory, projects: view.projects.map(toProjectWire) };
}

/**
 * Department profiles (`US-03-06`). The IT Admin keeps them; a department head reads the one they head and the
 * list of its people (`US-01-02` AC-7); Finance, employees and the Super Admin change nothing here (AC-16). The
 * Super Admin sees the warnings only (`SoD-1`). There is no route that merges or splits departments (AC-20) or
 * deletes one: a department is retired.
 */
@ApiTags('departments')
@Controller({ version: '1' })
export class DepartmentsController {
  constructor(private readonly departments: DepartmentService) {}

  @Get('departments')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'departmentList' })
  @ApiSuccessResponse(DepartmentPageResponseDto, {
    message: 'DEPARTMENT.LISTED',
    description: 'A page of departments in code order, each with its head today, its people count and its warnings.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, VALIDATION_ERROR)
  async list(@Query() query: ListDepartmentsQueryDto) {
    try {
      const page = await this.departments.list(query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'departmentCreate' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEPARTMENT.CREATED',
    description:
      'The department exists, charged to the UNIT Cost Center chosen, with nobody heading it yet. warnings says what is still missing.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, VALIDATION_ERROR, {
    status: HttpStatus.CONFLICT,
    description:
      'The code is taken (DEPARTMENT.CODE_TAKEN) or another department already has the Cost Center (DEPARTMENT.COST_CENTER_TAKEN).',
  })
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateDepartmentBodyDto) {
    try {
      return toProfileWire(
        await this.departments.create(actor, {
          code: body.code,
          name: body.name,
          functionDescription: body.function,
          costCenterId: body.costCenterId,
          itAdminEmployeeId: body.itAdminEmployeeId,
        }),
      );
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get('departments/:id')
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'departmentGet' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.FETCHED',
    description:
      'The profile: Cost Center, IT Admin in charge, head today and before, people count, projects, warnings.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.FORBIDDEN,
    description:
      'Not an IT Admin, or a department head asking about a department that is not theirs (DEPARTMENT.OUT_OF_SCOPE).',
  })
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param() params: DepartmentIdParamDto) {
    try {
      return toProfileWire(await this.departments.profile(principal, params.id));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Patch('departments/:id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'departmentUpdate' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.UPDATED',
    description: 'The name, the description or the IT Admin in charge changed. The Cost Center and the people do not.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, VALIDATION_ERROR, NOT_FOUND)
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: UpdateDepartmentBodyDto,
  ) {
    try {
      return toProfileWire(
        await this.departments.update(actor, params.id, {
          name: body.name,
          functionDescription: body.function,
          itAdminEmployeeId: body.itAdminEmployeeId,
        }),
      );
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments/:id/deactivate')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'departmentDeactivate' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.DEACTIVATED',
    description: 'The department is retired: it takes no new member or head. Already retired ⟹ the same answer.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description: 'It still has members (DEPARTMENT.IN_USE; details lists them).',
  })
  async deactivate(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: DepartmentIdParamDto) {
    try {
      return toProfileWire(await this.departments.deactivate(actor, params.id));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments/:id/head-assignments')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'departmentHeadAssign' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.HEAD_ASSIGNED',
    description:
      'The person heads the department from the date; the head before ends the day before. The person must be a member of the department that day.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, VALIDATION_ERROR, NOT_FOUND)
  async assignHead(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: AssignHeadBodyDto,
  ) {
    try {
      return toProfileWire(await this.departments.assignHead(actor, params.id, body));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments/:id/head-vacancies')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'departmentHeadVacate' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.HEAD_VACATED',
    description: 'Nobody heads the department from the date; it shows as missing a head. Nothing to end ⟹ no change.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, VALIDATION_ERROR, NOT_FOUND)
  async vacateHead(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: VacateHeadBodyDto,
  ) {
    try {
      return toProfileWire(await this.departments.vacateHead(actor, params.id, body));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get('departments/:id/employees')
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'departmentMemberList' })
  @ApiSuccessResponse(DepartmentMembersResponseDto, {
    message: 'DEPARTMENT.MEMBERS_LISTED',
    description:
      'The people in the department today: code, name, status, whether they have a work email, and since when. No email, contract or finance data (QĐ-41c).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.FORBIDDEN,
    description: 'Not an IT Admin, or a department head asking about a department that is not theirs.',
  })
  async members(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Query() query: ListMembersQueryDto,
  ) {
    try {
      return await this.departments.members(principal, params.id, query);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get('department-warnings')
  @RequireRoles('IT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentWarningList' })
  @ApiSuccessResponse(DepartmentWarningsResponseDto, {
    message: 'DEPARTMENT.WARNINGS_LISTED',
    description:
      'The active departments that miss a head or a usable IT Admin in charge. The Super Admin sees these and nothing else of the departments.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the IT Admin and the Super Admin see department warnings.',
  })
  async warnings() {
    try {
      return { items: await this.departments.warnings() };
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
