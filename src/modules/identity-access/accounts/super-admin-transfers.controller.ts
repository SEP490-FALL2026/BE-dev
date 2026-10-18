import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SuperAdminTransferBodyDto, SuperAdminTransferResponseDto } from '../dto/super-admin-transfer.dto';
import { toAccountApiException } from './account.http-errors';
import { SuperAdminTransferRefusedError, SuperAdminTransferService } from './super-admin-transfer.service';

function toTransferApiException(error: unknown): unknown {
  if (error instanceof SuperAdminTransferRefusedError) {
    if (error.problem === 'NOT_HOLDER') {
      // The role moved while this request was waiting (US-01-09 AC-5): the same answer as a caller who never had it.
      return new ApiException(HttpStatus.FORBIDDEN, {
        code: 'AUTHORIZATION.FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }
    const status = error.problem === 'SUCCESSOR_NOT_FOUND' ? HttpStatus.NOT_FOUND : HttpStatus.UNPROCESSABLE_ENTITY;

    return new ApiException(status, { code: `SUPER_ADMIN_TRANSFER.${error.problem}`, message: error.message });
  }

  return toAccountApiException(error);
}

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
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The successor account does not exist (SUPER_ADMIN_TRANSFER.SUCCESSOR_NOT_FOUND).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the successor does not qualify: the caller themselves, a locked account, a person who is not working, an account not activated or with an unverified email, one holding the IT Admin or Finance role, an approval role, or heading a department.',
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async transfer(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SuperAdminTransferBodyDto) {
    try {
      return await this.transfers.transfer(actor, body.successorAppUserId);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }
}
