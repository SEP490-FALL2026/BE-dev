import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { CreateEmployeeBodyDto, EmployeeResponseDto } from './dto/employee.dto';
import { EmployeeManualService } from './employee-manual.service';
import { toOrganizationApiException } from './organization.http-errors';

/**
 * Entering people by hand (`US-02-02` AC-14). IT Admin only: the Super Admin does no business work (`SoD-1`).
 * It creates the person and their one placement; it never creates a login (that is the Super Admin's step).
 */
@ApiTags('employees')
@Controller({ path: 'employees', version: '1' })
@RequireRoles('IT_ADMIN')
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
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin may enter people.' },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is malformed (VALIDATION_ERROR), or the row cannot become an employee (EMPLOYEE.ROW_INVALID; details.reasons lists every field and code).',
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
