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
import { ORGANIZATION_ERROR_EXAMPLES, toOrganizationApiException } from '../organization.http-errors';
import {
  EmployeeDetailResponseDto,
  EmployeeDirectoryIdParamDto,
  EmployeeListQueryDto,
  EmployeeListResponseDto,
} from './employee-directory.dto';
import { EmployeeDirectoryQueryService } from './employee-directory-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const SUPER_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin reads the company-wide employee directory.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

const QUERY_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

const PARAM_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is not a UUID (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

const EMPLOYEE_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The employee does not exist.',
  examples: [ORGANIZATION_ERROR_EXAMPLES.EMPLOYEE_NOT_FOUND],
} as const;

@ApiTags('employees')
@Controller({ path: 'employees', version: '1' })
@RequireRoles('SUPER_ADMIN')
export class EmployeeDirectoryController {
  constructor(private readonly queryService: EmployeeDirectoryQueryService) {}

  @Get()
  @ApiOperation({ operationId: 'employeeList', summary: 'List company-wide employee directory' })
  @ApiSuccessResponse(EmployeeListResponseDto, {
    message: 'EMPLOYEE.LISTED',
    description: 'A page of company employees with official status and current department.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, QUERY_INVALID)
  async list(@Query() query: EmployeeListQueryDto) {
    try {
      return await this.queryService.listEmployees(query);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'employeeGet', summary: 'Get employee profile and placement history' })
  @ApiSuccessResponse(EmployeeDetailResponseDto, {
    message: 'EMPLOYEE.FETCHED',
    description: 'The official employee profile, placement history and account roles.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, EMPLOYEE_NOT_FOUND, PARAM_INVALID)
  async get(@Param() param: EmployeeDirectoryIdParamDto) {
    try {
      return await this.queryService.getEmployee(param.id);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
