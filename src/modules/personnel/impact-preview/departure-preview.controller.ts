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
import { RecordOffboardingBodyDto } from '../offboarding/offboarding.dto';
import { OFFBOARDING_ERROR_EXAMPLES as E, toOffboardingApiException } from '../offboarding/offboarding.http-errors';
import { PERSONNEL_ACCESS_ERROR_EXAMPLES } from '../personnel-access.http-errors';
import { userActor } from '../public/personnel.types';
import { DeparturePreviewService } from './departure-preview.service';
import { DeparturePreviewResponseDto } from './impact-preview.dto';

/** Only the Super Admin records a departure, so only the Super Admin previews it, and never about themselves. */
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the Super Admin records a departure and so previews it (AUTHORIZATION.FORBIDDEN); the Super Admin does not do either about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN).',
  examples: [FORBIDDEN_EXAMPLE, PERSONNEL_ACCESS_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN],
} as const;

/**
 * The preview of the departure of a person (`QĐ-110` G2 (3)): the body of the record, no write. The role is judged again by the service, so this guard is only
 * the outer layer.
 */
@ApiTags('offboarding-cases')
@Controller({ path: 'offboarding-cases', version: '1' })
export class DeparturePreviewController {
  constructor(private readonly previews: DeparturePreviewService) {}

  @Post('preview')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'offboardingCasePreview', summary: 'Preview what recording a departure would do' })
  @ApiSuccessResponse(DeparturePreviewResponseDto, {
    message: 'OFFBOARDING_CASE.PREVIEWED',
    description:
      'What recording the departure would do, without writing anything: the personal rights the person holds that the IT Admin takes away, the open requests the system closes the day the access is blocked and the ones with a grant under way that it leaves to the IT Admin, the money held for the closed ones that goes back to the budget (by currency), what the person answers for in the catalog if they are an IT Admin, the plans they administer at the vendor, whether a successor must be named for the head, and the day the IT Admin has until. The body is the one of the record and is refused the way the record refuses it, with the same codes; the answer is the same reading the record makes, so it matches what the system then does. Nothing is saved, no notice is sent and no audit event is written.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    FORBIDDEN,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (OFFBOARDING_CASE.EMPLOYEE_NOT_FOUND).',
      examples: [E.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The record would be refused: the person has left (OFFBOARDING_CASE.EMPLOYEE_LEFT) or is handing over already (ALREADY_HANDING_OVER), has a transfer that takes effect before the last working day or another event waiting (PENDING_EVENT_EXISTS), has placements but none in force or scheduled (PLACEMENT_OVERLAP), or was changed meanwhile (CONCURRENT_CHANGE).',
      examples: [
        E.EMPLOYEE_LEFT,
        E.ALREADY_HANDING_OVER,
        E.PENDING_EVENT_EXISTS,
        E.CONCURRENT_CHANGE,
        E.PLACEMENT_OVERLAP,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR) or the record would be refused: there is no last working day for a planned handover or the day is not allowed (OFFBOARDING_CASE.LAST_WORKING_DAY_REQUIRED, LAST_WORKING_DAY_INVALID), the basis is only the code of a notice (OFFBOARDING_CASE.GROUNDS_IS_NOTICE), a transfer that waits would be cancelled and the confirmation is missing (TRANSFER_CANCELLATION_REQUIRED), the person heads the department they leave and names nobody to follow them (PERSONNEL.SUCCESSOR_REQUIRED) or the one chosen cannot take the department that day (SUCCESSOR_NOT_A_MEMBER_ON_DATE).',
      examples: [
        VALIDATION_EXAMPLE,
        E.LAST_WORKING_DAY_REQUIRED,
        E.LAST_WORKING_DAY_INVALID,
        PERSONNEL_ACCESS_ERROR_EXAMPLES.SUCCESSOR_REQUIRED,
        E.SUCCESSOR_NOT_A_MEMBER_ON_DATE,
        E.GROUNDS_IS_NOTICE,
        E.TRANSFER_CANCELLATION_REQUIRED,
      ],
    },
  )
  async preview(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RecordOffboardingBodyDto) {
    try {
      return await this.previews.preview(userActor(actor), body);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }
}
