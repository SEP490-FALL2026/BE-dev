import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
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
  DepartmentMemberOpenRequestPageResponseDto,
  DepartmentMemberPageQueryDto,
  DepartmentMemberParamDto,
  DepartmentMemberResponseDto,
  DepartmentMemberSoftwareRightPageResponseDto,
} from './department-member.dto';
import {
  DEPARTMENT_MEMBER_ERROR_EXAMPLES as EXAMPLES,
  toDepartmentMemberApiException,
} from './department-member.http-errors';
import { DepartmentMemberQueryService } from './department-member-query.service';

const COMMON = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only a department head reads a person of the department, and only the head of that department today (AUTHORIZATION.FORBIDDEN for any other role, DEPARTMENT_MEMBER.OUT_OF_SCOPE for the head of another department).',
    examples: [FORBIDDEN_EXAMPLE, EXAMPLES.OUT_OF_SCOPE],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description:
      'The department does not exist, or the person is not placed in it today: one who moved away and one who never existed are not told apart (DEPARTMENT_MEMBER.NOT_FOUND).',
    examples: [EXAMPLES.NOT_FOUND],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'An id or a page parameter is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;

/**
 * One person of a department as its head reads them (`QĐ-41c`(2)): the record, the software the person holds and the requests of
 * theirs from this department that are not over. Head only; no email, contract type, money or reason of a grant. Nothing is changed.
 */
@ApiTags('departments')
@Controller({ path: 'departments/:id/employees/:employeeId', version: '1' })
@RequireRoles('MANAGER')
export class DepartmentMemberController {
  constructor(private readonly members: DepartmentMemberQueryService) {}

  @Get()
  @ApiOperation({
    operationId: 'departmentMemberGet',
    summary: 'Read one person of the department as its head',
  })
  @ApiSuccessResponse(DepartmentMemberResponseDto, {
    message: 'DEPARTMENT_MEMBER.READ',
    description:
      'The person placed in the department today: code, name, whether they have a work email, since when they are in the department, how many seats they hold and how many requests of theirs from this department are not over. The seats and the requests are in the two lists below.',
  })
  @ApiErrorResponses(...COMMON)
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param() params: DepartmentMemberParamDto) {
    try {
      return await this.members.get(principal, params.id, params.employeeId);
    } catch (error) {
      throw toDepartmentMemberApiException(error);
    }
  }

  @Get('software-rights')
  @ApiOperation({
    operationId: 'departmentMemberSoftwareRightList',
    summary: 'List the software a person of the department holds',
  })
  @ApiSuccessResponse(DepartmentMemberSoftwareRightPageResponseDto, {
    message: 'DEPARTMENT_MEMBER.SOFTWARE_RIGHTS_LISTED',
    description:
      'A page of the personal seats the person holds today, oldest first: the software and the plan by name, since when and until when. No price, key, account identifier or reason of the grant.',
  })
  @ApiErrorResponses(...COMMON)
  async softwareRights(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: DepartmentMemberParamDto,
    @Query() query: DepartmentMemberPageQueryDto,
  ) {
    try {
      return await this.members.softwareRights(principal, params.id, params.employeeId, query);
    } catch (error) {
      throw toDepartmentMemberApiException(error);
    }
  }

  @Get('open-requests')
  @ApiOperation({
    operationId: 'departmentMemberOpenRequestList',
    summary: 'List the requests of a person of the department that are not over',
  })
  @ApiSuccessResponse(DepartmentMemberOpenRequestPageResponseDto, {
    message: 'DEPARTMENT_MEMBER.OPEN_REQUESTS_LISTED',
    description:
      'A page of the requests the person is the beneficiary of that were sent from this department and are not over, oldest first. A request sent from the department the person came from is not among them.',
  })
  @ApiErrorResponses(...COMMON)
  async openRequests(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: DepartmentMemberParamDto,
    @Query() query: DepartmentMemberPageQueryDto,
  ) {
    try {
      return await this.members.openRequests(principal, params.id, params.employeeId, query);
    } catch (error) {
      throw toDepartmentMemberApiException(error);
    }
  }
}
