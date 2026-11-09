import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { HandoverConfirmationService } from './handover-confirmation.service';
import { HandoverViewService } from './handover-view.service';
import {
  ConfirmHandoverBodyDto,
  HandoverDutyDetailResponseDto,
  HandoverDutyIdParamDto,
  HandoverDutyPageResponseDto,
  ListHandoverDutiesQueryDto,
} from './handover.dto';
import { HANDOVER_ERROR_EXAMPLES as EXAMPLES, toHandoverApiException } from './handover.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The duty does not exist, or has nothing to do with the caller (HANDOVER_DUTY.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * The confirmations that the data of a tool was handed over before its seat is taken away. Any signed-in person may ask: what a
 * person sees and does is judged from the duty, because the person who follows a head who leaves holds no role yet. The IT Admin
 * reads every duty and confirms only those that are the business of the IT Admin.
 */
@ApiTags('handover-duties')
@Controller({ path: 'handover-duties', version: '1' })
@AuthenticatedOnly()
export class HandoverDutiesController {
  constructor(
    private readonly views: HandoverViewService,
    private readonly confirmations: HandoverConfirmationService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'handoverDutyList', summary: 'List the handover duties of the caller' })
  @ApiSuccessResponse(HandoverDutyPageResponseDto, {
    message: 'HANDOVER_DUTY.LISTED',
    description:
      'A page of handover duties, the earliest deadline first. By default (scope mine) the duties that fall to the caller: those fixed to them, those of the people in the department they head, and those of a head who leaves when the caller is the one designated to follow. With scope all an IT Admin reads every duty without confirming them. A row names the tool, the plan and the person, says who confirms, the deadline, whether it passed, whether the revocation went on without the confirmation, and why nobody is named yet while nobody is. The notice of the plan and the confirmation are in the detail.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin asks for scope all (HANDOVER_DUTY.SCOPE_FORBIDDEN).',
      examples: [EXAMPLES.SCOPE_FORBIDDEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'A filter is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListHandoverDutiesQueryDto) {
    try {
      return await this.views.list(actor, query);
    } catch (error) {
      throw toHandoverApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'handoverDutyGet', summary: 'Read a handover duty in full' })
  @ApiSuccessResponse(HandoverDutyDetailResponseDto, {
    message: 'HANDOVER_DUTY.RETRIEVED',
    description:
      'The duty with the notice of the plan as it was when the duty was opened, the person it falls to now, and the confirmation (the value, the role the person confirmed in, the moment and whether it came after the deadline) or the cancellation.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: HandoverDutyIdParamDto) {
    try {
      return await this.views.get(actor, params.id);
    } catch (error) {
      throw toHandoverApiException(error);
    }
  }

  @Post(':id/confirmations')
  @ApiOperation({ operationId: 'handoverDutyConfirm', summary: 'Confirm that the data of a tool was handed over' })
  @ApiSuccessResponse(HandoverDutyDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'HANDOVER_DUTY.CONFIRMED',
    description:
      'Records, once, who confirmed, in which role, when, and whether it came after the deadline. A person who leaves says HANDED_OVER or NOT_NEEDED; every other case says HANDLED. The confirmation is not the result of the revocation: it neither starts nor ends it, and one that comes after the revocation went on is only recorded. The content of the data is not recorded.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not the person the duty falls to: another head, the head before a transfer, an IT Admin for the duty of a head, a stand-in approver, Finance, a spending approver or the Super Admin (HANDOVER_DUTY.NOT_CONFIRMER). Nothing is written.',
      examples: [EXAMPLES.NOT_CONFIRMER],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The duty was confirmed already (HANDOVER_DUTY.ALREADY_CONFIRMED) or was cancelled with the case it belonged to (HANDOVER_DUTY.CANCELLED): nothing changes.',
      examples: [EXAMPLES.ALREADY_CONFIRMED, EXAMPLES.CANCELLED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or the value is not one this duty allows (HANDOVER_DUTY.VALUE_NOT_ALLOWED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.VALUE_NOT_ALLOWED],
    },
  )
  async confirm(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: HandoverDutyIdParamDto,
    @Body() body: ConfirmHandoverBodyDto,
  ) {
    try {
      const duty = await this.confirmations.confirm(actor, params.id, body.value);

      return await this.views.detailOf(actor, duty);
    } catch (error) {
      throw toHandoverApiException(error);
    }
  }
}
