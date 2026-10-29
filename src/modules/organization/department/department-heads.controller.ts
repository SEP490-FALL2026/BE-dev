import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ORGANIZATION_ERROR_EXAMPLES, toOrganizationApiException } from '../mappers/organization.http-errors';
import { DepartmentHeadService } from './department-head.service';
import { DepartmentQueryService } from './department-query.service';
import {
  AssignHeadBodyDto,
  ClearSuccessorBodyDto,
  DepartmentIdParamDto,
  DepartmentResponseDto,
  DesignateSuccessorBodyDto,
  VacateHeadBodyDto,
} from './department.dto';
import { toDepartmentProfileWire } from './department.mapper';
import {
  AUTH_ERRORS,
  NOT_FOUND,
  SUPER_ADMIN_ONLY,
  VALIDATION_ERROR,
  VALIDATION_ERROR_DESCRIPTION,
} from './department.http-errors';

const HEAD_ASSIGN_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [
    VALIDATION_EXAMPLE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_DATE_IN_PAST,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_EMPLOYEE_NOT_ACTIVE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_EMPLOYEE_NOT_FOUND,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_HEADS_ANOTHER_DEPARTMENT,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_NOT_A_MEMBER_ON_DATE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_SUPER_ADMIN_CANNOT_HEAD,
  ],
} as const;
const HEAD_VACATE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE, ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_DATE_IN_PAST],
} as const;
const SUCCESSOR_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [
    VALIDATION_EXAMPLE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_SUCCESSOR_DATE_NOT_FUTURE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_SUCCESSOR_NEEDS_A_HEAD,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_SUCCESSOR_IS_THE_HEAD,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_EMPLOYEE_NOT_ACTIVE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_EMPLOYEE_NOT_FOUND,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_HEADS_ANOTHER_DEPARTMENT,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_NOT_A_MEMBER_ON_DATE,
    ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_SUPER_ADMIN_CANNOT_HEAD,
  ],
} as const;
/**
 * Who heads a department and who is to follow them (`US-03-06` AC-5 → AC-9, AC-18; `QĐ-87` `D-5`). The Super Admin alone names the
 * head, leaves the department without one, names the successor and takes them back, each on an HR basis; the IT Admin does none
 * of it. Who may is decided by the policy of the service as well as by the role of the route (`F13`). Every change answers with the
 * profile of the department as it is after the change.
 */
@ApiTags('departments')
@Controller({ version: '1' })
export class DepartmentHeadsController {
  constructor(
    private readonly heads: DepartmentHeadService,
    private readonly queries: DepartmentQueryService,
  ) {}

  private async profileAfter(actor: AuthenticatedPrincipal, id: string) {
    return toDepartmentProfileWire(await this.queries.profile(actor, id));
  }

  @Post('departments/:id/head-assignments')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentHeadAssign', summary: 'Name the head of a department' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.HEAD_ASSIGNED',
    description:
      'The person heads the department from the date, on the HR basis given; the head before ends the day before. The person must be a member of the department that day. What was kept for the department while nobody headed it is handed to them.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, HEAD_ASSIGN_INVALID, NOT_FOUND)
  async assignHead(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: AssignHeadBodyDto,
  ) {
    try {
      await this.heads.assign(actor, params.id, body);

      return await this.profileAfter(actor, params.id);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments/:id/head-vacancies')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentHeadVacate', summary: 'Leave a department without a head' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.HEAD_VACATED',
    description:
      'Nobody heads the department from the date, on the HR basis given; it shows as missing a head. If there is no head to end, nothing changes.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, HEAD_VACATE_INVALID, NOT_FOUND)
  async vacateHead(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: VacateHeadBodyDto,
  ) {
    try {
      await this.heads.vacate(actor, params.id, body);

      return await this.profileAfter(actor, params.id);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments/:id/successor-designations')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'departmentSuccessorDesignate',
    summary: 'Name who is to follow the head of a department',
  })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.SUCCESSOR_DESIGNATED',
    description:
      'The person is named to head the department from a day after today, on the HR basis given: the head in force now ends the day before, and the profile shows the person as the successor. The person must be a member of the department that day. Somebody has to head the department today.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, SUCCESSOR_INVALID, NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description:
      'A successor is already named (DEPARTMENT.HEAD_SUCCESSOR_ALREADY_NAMED): take them back first, or the department is retired (DEPARTMENT.INACTIVE).',
    examples: [ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_HEAD_SUCCESSOR_ALREADY_NAMED],
  })
  async designateSuccessor(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: DesignateSuccessorBodyDto,
  ) {
    try {
      await this.heads.designateSuccessor(actor, params.id, body);

      return await this.profileAfter(actor, params.id);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post('departments/:id/successor-clearances')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentSuccessorClear', summary: 'Take back the successor named for the head' })
  @ApiSuccessResponse(DepartmentResponseDto, {
    message: 'DEPARTMENT.SUCCESSOR_CLEARED',
    description:
      'Nobody is named to follow the head any more, on the HR basis given: the head keeps the department. If nobody is named, nothing changes.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, VALIDATION_ERROR, NOT_FOUND)
  async clearSuccessor(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentIdParamDto,
    @Body() body: ClearSuccessorBodyDto,
  ) {
    try {
      await this.heads.clearSuccessor(actor, params.id, body);

      return await this.profileAfter(actor, params.id);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
