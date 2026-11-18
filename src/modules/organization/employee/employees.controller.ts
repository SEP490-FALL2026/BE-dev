import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
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
import { CreateEmployeeBodyDto, EmployeeResponseDto, EmployeeIdParamDto, FirstPlacementBodyDto } from './employee.dto';
import { EmployeeFirstPlacementService } from './employee-first-placement.service';
import { EmployeeManualService } from './employee-manual.service';
import { EMPLOYEE_ERROR_EXAMPLES, toEmployeeApiException } from './employee.http-errors';

/**
 * Entering people by hand (`US-02-02` AC-14). Super Admin only, with no HR basis to give (`QĐ-82i`, `QĐ-93f`): the IT
 * Admin, a department head and Finance do not enter new records, whatever the route lets through. It creates the person
 * and their one placement and tells the head of the department and the IT Admin in charge; it never creates a login, a
 * role or an invitation.
 */
@ApiTags('employees')
@Controller({ path: 'employees', version: '1' })
@RequireRoles('SUPER_ADMIN')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeeManualService,
    private readonly firstPlacement: EmployeeFirstPlacementService,
  ) {}

  @Post(':id/first-placements')
  @ApiOperation({ operationId: 'employeeFirstPlacement', summary: 'Place an employee for the first time' })
  @ApiSuccessResponse(EmployeeResponseDto, { status: HttpStatus.CREATED, message: 'EMPLOYEE.FIRST_PLACED' })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only SUPER_ADMIN may place employees.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Employee or department not found.',
      examples: [EMPLOYEE_ERROR_EXAMPLES.EMPLOYEE_NOT_FOUND, EMPLOYEE_ERROR_EXAMPLES.DEPARTMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'EMPLOYEE.ALREADY_PLACED, EMPLOYEE.EMPLOYEE_INACTIVE, EMPLOYEE.EMPLOYEE_LEAVING (the employee is handing over before leaving) or DEPARTMENT.INACTIVE.',
      examples: [
        EMPLOYEE_ERROR_EXAMPLES.EMPLOYEE_ALREADY_PLACED,
        EMPLOYEE_ERROR_EXAMPLES.EMPLOYEE_INACTIVE,
        EMPLOYEE_ERROR_EXAMPLES.DEPARTMENT_INACTIVE,
        EMPLOYEE_ERROR_EXAMPLES.EMPLOYEE_LEAVING,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'Invalid date or body, or the department takes effect later than the day (DEPARTMENT.NOT_YET_EFFECTIVE: a department made for next year takes nobody in before 1 January).',
      examples: [
        VALIDATION_EXAMPLE,
        EMPLOYEE_ERROR_EXAMPLES.EMPLOYEE_DATE_INVALID,
        EMPLOYEE_ERROR_EXAMPLES.DEPARTMENT_NOT_YET_EFFECTIVE,
      ],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async place(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: EmployeeIdParamDto,
    @Body() body: FirstPlacementBodyDto,
  ) {
    try {
      return await this.firstPlacement.place(actor, params.id, body);
    } catch (error) {
      throw toEmployeeApiException(error);
    }
  }

  @Post()
  @ApiOperation({ operationId: 'employeeCreate', summary: 'Enter one employee by hand' })
  @ApiSuccessResponse(EmployeeResponseDto, {
    status: HttpStatus.CREATED,
    message: 'EMPLOYEE.CREATED',
    description:
      'The employee and their placement were created. No account, role, invitation or mail is created. The person is a member of the department from the day they are recorded.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin may enter people.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        "The body is malformed, or still carries an HR basis, which no entry takes (VALIDATION_ERROR), or the row cannot become an employee (EMPLOYEE.ROW_INVALID; details.reasons lists every field and code, among them OWN_RECORD for the Super Admin's own code or email).",
      examples: [VALIDATION_EXAMPLE, EMPLOYEE_ERROR_EXAMPLES.EMPLOYEE_ROW_INVALID],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateEmployeeBodyDto) {
    try {
      return await this.employees.create(actor, body);
    } catch (error) {
      throw toEmployeeApiException(error);
    }
  }
}
