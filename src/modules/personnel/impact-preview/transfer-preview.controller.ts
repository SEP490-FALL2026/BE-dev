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
import { PERSONNEL_ACCESS_ERROR_EXAMPLES } from '../personnel-access.http-errors';
import { userActor } from '../public/personnel.types';
import { RecordTransferBodyDto } from '../transfer/transfer.dto';
import { TRANSFER_ERROR_EXAMPLES as E, toTransferApiException } from '../transfer/transfer.http-errors';
import { TransferPreviewResponseDto } from './impact-preview.dto';
import { TransferPreviewService } from './transfer-preview.service';

/** Only the Super Admin records a transfer, so only the Super Admin previews it, and never about themselves. */
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the Super Admin records a transfer and so previews it (AUTHORIZATION.FORBIDDEN); the Super Admin does not do either about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN).',
  examples: [FORBIDDEN_EXAMPLE, PERSONNEL_ACCESS_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN],
} as const;

/**
 * The preview of the transfer of a person (`QĐ-110` G2 (3)): the body of the record, no write. The role is judged again by the service, so this guard is
 * only the outer layer.
 */
@ApiTags('department-transfers')
@Controller({ path: 'department-transfers', version: '1' })
export class TransferPreviewController {
  constructor(private readonly previews: TransferPreviewService) {}

  @Post('preview')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentTransferPreview', summary: 'Preview what recording a transfer would do' })
  @ApiSuccessResponse(TransferPreviewResponseDto, {
    message: 'DEPARTMENT_TRANSFER.PREVIEWED',
    description:
      'What recording the transfer would do, without writing anything: the personal rights of the old department that the system takes back when the grace ends (the ones the person holds the day the transfer takes effect that a revocation can take away, the very ones it then opens), the paid requests sent from the old department that it closes the day the transfer takes effect and the ones with a grant under way that it leaves to the IT Admin, the money held for the closed ones that goes back to the budget (by currency), what the person answers for in the catalog if they are an IT Admin, the plans they administer at the vendor, whether a successor must be named for the head, and the last day of the grace with the day the person is told once more. The body is the one of the record and is refused the way the record refuses it, with the same codes. Nothing is saved, no notice is sent and no audit event is written.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    FORBIDDEN,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (DEPARTMENT_TRANSFER.EMPLOYEE_NOT_FOUND).',
      examples: [E.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The record would be refused: the person has left (DEPARTMENT_TRANSFER.EMPLOYEE_LEFT) or has another event waiting (PENDING_EVENT_EXISTS), the destination department cannot take people (DEPARTMENT_INACTIVE), or the placements cannot take it (PLACEMENT_OVERLAP, CONCURRENT_CHANGE).',
      examples: [
        E.EMPLOYEE_LEFT,
        E.PENDING_EVENT_EXISTS,
        E.DEPARTMENT_INACTIVE,
        E.PLACEMENT_OVERLAP,
        E.CONCURRENT_CHANGE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR) or the record would be refused: the day is in the past or not after the first day of the current placement (DEPARTMENT_TRANSFER.EFFECTIVE_DATE_IN_PAST, EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD), the department does not change (NO_CHANGE), is unknown (DEPARTMENT_NOT_FOUND) or takes effect later than the day (DEPARTMENT_NOT_YET_EFFECTIVE), the basis is only the code of a notice (GROUNDS_IS_NOTICE), or the head of the department they leave is not provided for (PERSONNEL.SUCCESSOR_REQUIRED, DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE).',
      examples: [
        VALIDATION_EXAMPLE,
        E.NO_CHANGE,
        E.EFFECTIVE_DATE_IN_PAST,
        E.EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD,
        E.DEPARTMENT_NOT_FOUND,
        E.DEPARTMENT_NOT_YET_EFFECTIVE,
        E.GROUNDS_IS_NOTICE,
        PERSONNEL_ACCESS_ERROR_EXAMPLES.SUCCESSOR_REQUIRED,
        E.SUCCESSOR_NOT_A_MEMBER_ON_DATE,
      ],
    },
  )
  async preview(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RecordTransferBodyDto) {
    try {
      return await this.previews.preview(userActor(actor), body);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }
}
