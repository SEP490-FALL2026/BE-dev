import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  VALIDATION_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SuperAdminTransferBodyDto, SuperAdminTransferResponseDto } from './super-admin-transfer.dto';
import { SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES, toSuperAdminTransferApiException } from '../mappers/account.http-errors';
import { SuperAdminTransferService } from './super-admin-transfer.service';

/**
 * Handing the Super Admin role to a successor (`US-01-09`). Only the holder may; it is the one way the role changes
 * hands in the application (AC-7): the grant and revoke routes of account administration refuse `SUPER_ADMIN`.
 */
@ApiTags('super-admin-transfers')
@Controller({ path: 'super-admin-transfers', version: '1' })
export class SuperAdminTransfersController {
  constructor(private readonly transfers: SuperAdminTransferService) {}

  @Post()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'superAdminTransfer', summary: 'Transfer the Super Admin role' })
  @ApiSuccessResponse(SuperAdminTransferResponseDto, {
    message: 'SUPER_ADMIN.TRANSFERRED',
    description:
      'The successor holds the Super Admin role and the caller no longer does; from the caller’s next request on they hold only the roles they had besides it.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller does not hold the Super Admin role (any more).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The successor account does not exist (SUPER_ADMIN_TRANSFER.SUCCESSOR_NOT_FOUND).',
      examples: [SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.SUCCESSOR_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the successor does not qualify: the caller themselves, a locked account, a person who is not working, an account not activated or with an unverified email, one holding the IT Admin or Finance role, an approval role, or heading a department.',
      examples: [
        VALIDATION_EXAMPLE,
        SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.SUCCESSOR_IS_HOLDER,
        SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.ACCOUNT_LOCKED,
        SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.EMPLOYEE_NOT_WORKING,
        SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.NOT_ACTIVATED,
        SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.EMAIL_NOT_VERIFIED,
        SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.WORK_ROLE_HELD,
        SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.APPROVAL_ROLE_HELD,
        SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES.HEADS_DEPARTMENT,
      ],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async transfer(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SuperAdminTransferBodyDto) {
    try {
      return await this.transfers.transfer(actor, body.successorAppUserId);
    } catch (error) {
      throw toSuperAdminTransferApiException(error);
    }
  }
}
