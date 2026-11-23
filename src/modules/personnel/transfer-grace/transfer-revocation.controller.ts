import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  TRANSFER_REVOCATION_ERROR_EXAMPLES as EXAMPLES,
  toTransferRevocationApiException,
} from './transfer-revocation.http-errors';
import { TransferRevocationService } from './transfer-revocation.service';

const transferRevocationIdParamSchema = z.strictObject({ id: z.uuid() });
export class TransferRevocationIdParamDto extends createZodDto(transferRevocationIdParamSchema) {}

const transferRevocationReopenedDataSchema = z.strictObject({
  created: z.number().int().nonnegative(),
  reasonAdded: z.number().int().nonnegative(),
});
export class TransferRevocationReopenedResponseDto extends createZodDto(
  successEnvelopeSchema(transferRevocationReopenedDataSchema),
) {}

/**
 * Manual reopening of failed transfer revocations by an IT Admin after the grace period has ended.
 */
@ApiTags('department-transfers')
@Controller({ path: 'department-transfers', version: '1' })
export class TransferRevocationController {
  constructor(private readonly revocations: TransferRevocationService) {}

  @Post(':id/revocations')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'departmentTransferRevocationReopen',
    summary: 'Reopen failed transfer revocations',
  })
  @ApiSuccessResponse(TransferRevocationReopenedResponseDto, {
    status: HttpStatus.OK,
    message: 'DEPARTMENT_TRANSFER.REVOCATION_REOPENED',
    description:
      'Reopens revocation tasks for open rights of a transfer whose grace period has ended when prior revocation tasks were closed as failed.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin can reopen transfer revocations (AUTHORIZATION.FORBIDDEN).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The transfer does not exist (DEPARTMENT_TRANSFER.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The transfer grace has not ended or is already closed (DEPARTMENT_TRANSFER.REVOCATION_NOT_DUE), or no open rights remain to reopen revocation for (DEPARTMENT_TRANSFER.NOTHING_TO_REVOKE).',
      examples: [EXAMPLES.REVOCATION_NOT_DUE, EXAMPLES.NOTHING_TO_REVOKE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The transfer id parameter is not a valid UUID (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async reopen(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param() params: TransferRevocationIdParamDto) {
    try {
      return await this.revocations.reopen(principal, params.id);
    } catch (error) {
      throw toTransferRevocationApiException(error);
    }
  }
}
