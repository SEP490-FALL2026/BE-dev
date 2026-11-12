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
import { AssignmentIdParamDto } from '../assignment/assignment.dto';
import { toAssignmentWire } from '../assignment/assignment.mapper';
import { MachineAccountBodyDto, MachineAccountResponseDto } from './machine-account.dto';
import {
  MACHINE_ACCOUNT_ERROR_EXAMPLES as EXAMPLES,
  toMachineAccountApiException,
} from './machine-account.http-errors';
import { MachineAccountService } from './machine-account.service';

/**
 * The flag "used for a machine account" of the personal seat of an IT Admin (`QĐ-110m`, `R-9`). There is no service account any more: a
 * pipeline, a bot or a shared login is a seat of an IT Admin with this flag on, which INV-02 leaves out, so the IT Admin keeps their own
 * personal seat of the same subscription as well. A seat is never created here: the flag is put on a seat that was granted, and the grant
 * of a second personal seat of one subscription is refused by INV-02 before the flag exists.
 */
@ApiTags('license-assignments')
@Controller({ path: 'license-assignments', version: '1' })
export class MachineAccountController {
  constructor(private readonly machineAccounts: MachineAccountService) {}

  @Post(':id/machine-account')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'licenseAssignmentSetMachineAccount',
    summary: 'Turn the flag "used for a machine account" of a seat on or off',
  })
  @ApiSuccessResponse(MachineAccountResponseDto, {
    message: 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_CHANGED',
    description:
      'The seat as it is now, with isMachineAccount and machineAccountNote. Turning the flag on needs a note (the reason) and a seat of an IT Admin who works; turning it off clears the note. Asking for what already is changes nothing and answers the same. The seats taken do not change on any day.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin changes the flag of a seat.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The assignment does not exist (LICENSE_ASSIGNMENT.NOT_FOUND).',
      examples: [EXAMPLES.ASSIGNMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The seat has ended, is set to end, failed or was cancelled (LICENSE_ASSIGNMENT.NOT_OPEN), or turning the flag off would leave the person with two personal seats of the subscription for an overlapping period (LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_OVERLAP).',
      examples: [EXAMPLES.NOT_OPEN, EXAMPLES.OVERLAP],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR: the flag on without a note) or refused: LICENSE_ASSIGNMENT.NOT_PERSONAL (a service account of the earlier releases) or LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_HOLDER_NOT_IT_ADMIN (the person who holds the seat is not an IT Admin who works).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.NOT_PERSONAL, EXAMPLES.HOLDER_NOT_IT_ADMIN],
    },
  )
  async setMachineAccount(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: AssignmentIdParamDto,
    @Body() body: MachineAccountBodyDto,
  ) {
    try {
      const assignment = await this.machineAccounts.change(actor, params.id, {
        on: body.isMachineAccount,
        note: body.isMachineAccount ? (body.note ?? null) : null,
      });

      return { assignment: toAssignmentWire(assignment) };
    } catch (error) {
      throw toMachineAccountApiException(error);
    }
  }
}
