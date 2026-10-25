import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
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
import { CreateEmployeeBodyDto, EmployeeResponseDto } from './employee.dto';
import { EmployeeManualService } from './employee-manual.service';
import { ORGANIZATION_ERROR_EXAMPLES, toOrganizationApiException } from '../mappers/organization.http-errors';

/**
 * Entering people by hand (`US-02-02` AC-14). Super Admin only, on an HR basis (`QĐ-82i`, `US-01-05` AC-14): the IT
 * Admin, a department head and Finance do not enter new records. It creates the person and their one placement; it
 * never creates a login, a role or an invitation.
 */
@ApiTags('employees')
@Controller({ path: 'employees', version: '1' })
@RequireRoles('SUPER_ADMIN')
export class EmployeesController {
  constructor(private readonly employees: EmployeeManualService) {}

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
        "The body is malformed or lacks a part of the HR basis (VALIDATION_ERROR), or the row cannot become an employee (EMPLOYEE.ROW_INVALID; details.reasons lists every field and code, among them OWN_RECORD for the Super Admin's own code or email).",
      examples: [VALIDATION_EXAMPLE, ORGANIZATION_ERROR_EXAMPLES.EMPLOYEE_ROW_INVALID],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateEmployeeBodyDto) {
    try {
      return await this.employees.create(actor, body);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
