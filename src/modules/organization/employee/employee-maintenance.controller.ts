import { Body, Controller, HttpStatus, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { toOrganizationApiException } from '../mappers/organization.http-errors';
import { EmployeeIdParamDto, MaintainedEmployeeResponseDto, UpdateEmployeeBodyDto } from './employee.dto';
import { EmployeeMaintenanceService } from './employee-maintenance.service';

/**
 * Correcting the official fields of an employee record on an HR basis (`US-02-02` AC-19). The IT Admin does it, not the
 * Super Admin, who only creates records (`QĐ-82m`). The department, the title and the status are never changed here.
 */
@ApiTags('employees')
@Controller({ path: 'employees', version: '1' })
@RequireRoles('IT_ADMIN')
export class EmployeeMaintenanceController {
  constructor(private readonly maintenance: EmployeeMaintenanceService) {}

  @Patch(':id')
  @ApiOperation({ operationId: 'employeeUpdateOfficialFields', summary: 'Correct the official fields of an employee' })
  @ApiSuccessResponse(MaintainedEmployeeResponseDto, {
    message: 'EMPLOYEE.UPDATED',
    description:
      'The name, work email, kind of staff or a hire date still to come were changed on the HR basis given; the Audit Trail keeps the values before and after and the basis. The login email, the department, the title and the status are untouched.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an IT Admin corrects these fields; the record of an IT Admin goes to another IT Admin when one can act (EMPLOYEE.ANOTHER_IT_ADMIN_NEEDED).',
    },
    { status: HttpStatus.NOT_FOUND, description: 'The employee does not exist (EMPLOYEE.NOT_FOUND).' },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is malformed, names a field that is not an official one or lacks a part of the HR basis (VALIDATION_ERROR), names nothing to change (EMPLOYEE.UPDATE_EMPTY), or a value is refused (EMPLOYEE.ROW_INVALID: WORK_EMAIL_TAKEN, HIRE_DATE_LOCKED, HIRE_DATE_IN_PAST, OPEN_ASSIGNMENT_NEEDS_EXPECTED_END — a contractor, freelancer or intern needs an expected end on every open seat).',
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: EmployeeIdParamDto,
    @Body() body: UpdateEmployeeBodyDto,
  ) {
    try {
      return await this.maintenance.update(actor, params.id, body);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
