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
import { ItHandoverBodyDto, ItHandoverIdParamDto, ItHandoverResultResponseDto } from './it-handover.dto';
import { IT_HANDOVER_ERROR_EXAMPLES as E, toItHandoverApiException } from './it-handover.http-errors';
import { ItHandoverService, type ItHandoverResult } from './it-handover.service';

const WHO =
  'The IT Admin who is leaving hands over before the block of the departure or the day the transfer takes effect; from then on any IT Admin does. ';

const COMMON = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: `Only an IT Admin hands responsibilities over (AUTHORIZATION.FORBIDDEN). Before the block of the departure or the day the transfer takes effect only the IT Admin who is leaving does (IT_HANDOVER.NOT_YET_YOURS).`,
    examples: [FORBIDDEN_EXAMPLE, E.NOT_YET_YOURS],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  {
    status: HttpStatus.CONFLICT,
    description:
      'The departure or the transfer was cancelled (IT_HANDOVER.SOURCE_CANCELLED), or the IT Admin who leaves answers for no subscription and no application now (IT_HANDOVER.NOTHING_TO_HAND_OVER).',
    examples: [E.SOURCE_CANCELLED, E.NOTHING_TO_HAND_OVER],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The id or the body is invalid (VALIDATION_ERROR), or the one who would take the responsibilities is the one who gives them up (IT_HANDOVER.SAME_PERSON) or is not an IT Admin who works now (IT_HANDOVER.TARGET_NOT_IT_ADMIN): nothing moves.',
    examples: [VALIDATION_EXAMPLE, E.SAME_PERSON, E.TARGET_NOT_IT_ADMIN],
  },
] as const;

const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The departure or the transfer does not exist (IT_HANDOVER.NOT_FOUND).',
  examples: [E.NOT_FOUND],
} as const;

const wire = (result: ItHandoverResult) => ({
  sourceKind: result.source.kind,
  sourceId: result.source.id,
  fromEmployeeId: result.fromEmployeeId,
  toItAdminEmployeeId: result.toEmployeeId,
  subscriptions: result.subscriptions,
  applications: result.applications,
  handedOverAt: result.at.toISOString(),
});

/**
 * An IT Admin who leaves hands every subscription and application they answer for to another IT Admin in one operation (`QĐ-110j`, `R-8`,
 * `R-26`), for a departure or a transfer. It is never a condition of the file: the file moves and closes without it.
 */
@ApiTags('it-admin-handover')
@Controller({ version: '1' })
export class ItHandoverController {
  constructor(private readonly handovers: ItHandoverService) {}

  @Post('offboarding-cases/:id/it-admin-handover')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'offboardingCaseItAdminHandover',
    summary: 'Hand the responsibilities of a leaving IT Admin to another',
  })
  @ApiSuccessResponse(ItHandoverResultResponseDto, {
    message: 'OFFBOARDING_CASE.IT_ADMIN_HANDED_OVER',
    description: `${WHO}Every subscription and every application the person answers for now goes to the IT Admin named, in one operation: the Audit Trail names the person who gave them up, the one who took them and the departure, the log of the case says so, and the one who took them is told. The case is read again for its itHandover section.`,
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND)
  async handOverOffboarding(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ItHandoverIdParamDto,
    @Body() body: ItHandoverBodyDto,
  ) {
    try {
      return wire(
        await this.handovers.handOver(actor, { kind: 'OFFBOARDING_CASE', id: params.id }, body.toItAdminEmployeeId),
      );
    } catch (error) {
      throw toItHandoverApiException(error);
    }
  }

  @Post('department-transfers/:id/it-admin-handover')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'departmentTransferItAdminHandover',
    summary: 'Hand the responsibilities of a moving IT Admin to another',
  })
  @ApiSuccessResponse(ItHandoverResultResponseDto, {
    message: 'DEPARTMENT_TRANSFER.IT_ADMIN_HANDED_OVER',
    description: `${WHO}Every subscription and every application the person answers for now goes to the IT Admin named, in one operation: the Audit Trail names the person who gave them up, the one who took them and the transfer, and the one who took them is told. The transfer is read again for its itHandover section.`,
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND)
  async handOverTransfer(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ItHandoverIdParamDto,
    @Body() body: ItHandoverBodyDto,
  ) {
    try {
      return wire(
        await this.handovers.handOver(actor, { kind: 'DEPARTMENT_TRANSFER', id: params.id }, body.toItAdminEmployeeId),
      );
    } catch (error) {
      throw toItHandoverApiException(error);
    }
  }
}
