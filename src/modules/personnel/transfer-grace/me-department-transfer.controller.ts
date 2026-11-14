import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { MyTransferService } from './my-transfer.service';
import { MyTransferResponseDto, type MyTransferWire } from './transfer-grace.dto';

/**
 * The transfer of the person who asks while they keep the rights of the old department (`QĐ-110p`, P8): until when, and which rights. Open to
 * every signed-in account, and only ever about the account that asks.
 */
@ApiTags('me')
@Controller({ path: 'me/department-transfer', version: '1' })
export class MeDepartmentTransferController {
  constructor(private readonly mine: MyTransferService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meDepartmentTransferGet', summary: 'Read my own transfer while the grace lasts' })
  @ApiSuccessResponse(MyTransferResponseDto, {
    message: 'ME.DEPARTMENT_TRANSFER_RETRIEVED',
    description:
      'The transfer of the signed-in person that took effect and whose grace has not ended, or no data when there is none: the old and the new department, the day it took effect, the last day they keep the rights of the old department and the day they are told once more, and the rights that are still theirs and will be taken back when the grace ends. It is never about anyone else. After the last day the rights are being taken back and the answer is no data.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE)
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<MyTransferWire> {
    try {
      return await this.mine.of(principal);
    } catch (error) {
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
