import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AppointDepartmentItSubstituteBodyDto,
  AppointDepartmentItSubstituteResponseDto,
  DepartmentItSubstituteIdParamDto,
  DepartmentItSubstitutePageResponseDto,
  DepartmentItSubstituteResponseDto,
  ListDepartmentItSubstitutesQueryDto,
} from './department-it-substitute.dto';
import {
  AUTH_ERRORS,
  DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES,
  READ_ROLES_ONLY,
  SUPER_ADMIN_ONLY,
  toDepartmentItSubstituteApiException,
  VALIDATION_ERROR,
} from './department-it-substitute.http-errors';
import { toDepartmentItSubstituteWire } from './department-it-substitute.mapper';
import { DepartmentItSubstituteService } from './department-it-substitute.service';

@ApiTags('departments')
@Controller({ version: '1' })
export class DepartmentItSubstituteController {
  constructor(private readonly substitutes: DepartmentItSubstituteService) {}

  @Post('departments/:id/it-substitutes')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'departmentItSubstituteAppoint',
    summary: 'Appoint a temporary IT Admin substitute for a department',
  })
  @ApiSuccessResponse(AppointDepartmentItSubstituteResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEPARTMENT_IT_SUBSTITUTE.APPOINTED',
    description:
      'Appoints an active IT Admin as temporary substitute for the department and returns the appointment together with the IT Admin workload telemetry (warning when over 4 departments).',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    SUPER_ADMIN_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The department does not exist (DEPARTMENT.NOT_FOUND).',
      examples: [DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES.DEPARTMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The department already has an active substitute (DEPARTMENT_IT_SUBSTITUTE.ALREADY_ACTIVE), the candidate is already the IT Admin in charge (DEPARTMENT_IT_SUBSTITUTE.IS_IN_CHARGE), or the department is inactive (DEPARTMENT_IT_SUBSTITUTE.DEPARTMENT_INACTIVE).',
      examples: [
        DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES.ALREADY_ACTIVE,
        DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES.IS_IN_CHARGE,
        DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES.DEPARTMENT_INACTIVE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the candidate is not an active employee with a usable IT Admin account (DEPARTMENT_IT_SUBSTITUTE.NOT_USABLE_IT_ADMIN).',
      examples: [VALIDATION_EXAMPLE, DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES.NOT_USABLE_IT_ADMIN],
    },
  )
  async appoint(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentItSubstituteIdParamDto,
    @Body() body: AppointDepartmentItSubstituteBodyDto,
  ) {
    try {
      const result = await this.substitutes.appoint(actor, params.id, body);

      return {
        substitute: toDepartmentItSubstituteWire(result.substitute),
        itAdminLoad: result.itAdminLoad,
      };
    } catch (error) {
      throw toDepartmentItSubstituteApiException(error);
    }
  }

  @Post('department-it-substitutes/:id/end')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'departmentItSubstituteEnd',
    summary: 'End a temporary department IT Admin substitute appointment',
  })
  @ApiSuccessResponse(DepartmentItSubstituteResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEPARTMENT_IT_SUBSTITUTE.ENDED',
    description: 'Ends the active temporary IT Admin substitute appointment for the department.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    SUPER_ADMIN_ONLY,
    VALIDATION_ERROR,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The substitute appointment does not exist (DEPARTMENT_IT_SUBSTITUTE.NOT_FOUND).',
      examples: [DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The substitute appointment has already ended (DEPARTMENT_IT_SUBSTITUTE.ALREADY_ENDED).',
      examples: [DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES.ALREADY_ENDED],
    },
  )
  async end(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: DepartmentItSubstituteIdParamDto) {
    try {
      return toDepartmentItSubstituteWire(await this.substitutes.end(actor, params.id));
    } catch (error) {
      throw toDepartmentItSubstituteApiException(error);
    }
  }

  @Get('department-it-substitutes')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({
    operationId: 'departmentItSubstituteList',
    summary: 'List department IT Admin substitute appointments',
  })
  @ApiSuccessResponse(DepartmentItSubstitutePageResponseDto, {
    message: 'DEPARTMENT_IT_SUBSTITUTE.LISTED',
    description:
      'A page of department IT Admin substitute appointments ordered by appointedAt descending then id. IT Admins see appointments within their read scope or naming them as substitute.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READ_ROLES_ONLY, VALIDATION_ERROR)
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ListDepartmentItSubstitutesQueryDto,
  ) {
    try {
      const page = await this.substitutes.list(principal, query);

      return { items: page.items.map(toDepartmentItSubstituteWire), pagination: page.pagination };
    } catch (error) {
      throw toDepartmentItSubstituteApiException(error);
    }
  }
}
