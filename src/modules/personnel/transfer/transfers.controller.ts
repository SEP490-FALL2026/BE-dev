import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import {
  CancelTransferBodyDto,
  ListTransferChangesQueryDto,
  ListTransfersQueryDto,
  RecordTransferBodyDto,
  RescheduleTransferBodyDto,
  TransferChangePageResponseDto,
  TransferDetailResponseDto,
  TransferIdParamDto,
  TransferPageResponseDto,
  TransferRecordedResponseDto,
} from './transfer.dto';
import { toTransferApiException } from './transfer.http-errors';
import { TransferChangeService } from './transfer-change.service';
import { TransferClosureService } from './transfer-closure.service';
import { TransferQueryService } from './transfer-query.service';
import { TransferService } from './transfer.service';

const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin records, moves, cancels or reads transfers.',
} as const;
const COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The transfer does not exist (DEPARTMENT_TRANSFER.NOT_FOUND).',
} as const;

const GROUNDS_REFUSALS =
  'the basis is empty or lacks a part (DEPARTMENT_TRANSFER.GROUNDS_REQUIRED, GROUNDS_INCOMPLETE) or is the code of a notice and not a document (GROUNDS_IS_NOTICE)';

/**
 * Transfers of a person to another department or job title with the day they take effect and the basis they rest on. IT Admin
 * only: Finance, a department head and an employee are refused, and the Super Admin does no business work.
 */
@ApiTags('department-transfers')
@Controller({ path: 'department-transfers', version: '1' })
@RequireRoles('IT_ADMIN')
export class TransfersController {
  constructor(
    private readonly transfers: TransferService,
    private readonly changes: TransferChangeService,
    private readonly query: TransferQueryService,
    private readonly closures: TransferClosureService,
  ) {}

  @Post()
  @ApiOperation({ operationId: 'departmentTransferRecord', summary: 'Record a transfer of a person' })
  @ApiSuccessResponse(TransferRecordedResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEPARTMENT_TRANSFER.RECORDED',
    description:
      'The transfer was recorded: the placement the person has ends on the day and the new one begins on it, and the head of the department they leave is handed over or left empty as chosen. A day of today takes effect at once. The seats the person holds are not touched. A warning lists the applications the person is Business Owner of, which need another owner.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (DEPARTMENT_TRANSFER.EMPLOYEE_NOT_FOUND).',
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The person has left (DEPARTMENT_TRANSFER.EMPLOYEE_LEFT) or has another event waiting (PENDING_EVENT_EXISTS), the destination cannot take people (DEPARTMENT_INACTIVE), an IT Admin records it for themselves while another can (SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN), or the placements cannot take it (PLACEMENT_OVERLAP, CONCURRENT_CHANGE).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), the day is in the past or not after the first day of the current placement (DEPARTMENT_TRANSFER.EFFECTIVE_DATE_IN_PAST, EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD), nothing changes (NO_CHANGE), the department or the title is unknown or retired (DEPARTMENT_NOT_FOUND, JOB_TITLE_NOT_FOUND, JOB_TITLE_INACTIVE), ${GROUNDS_REFUSALS}, or the head of the department they leave is not provided for (HEAD_SUCCESSOR_REQUIRED, SUCCESSOR_NOT_A_MEMBER_ON_DATE).`,
    },
  )
  async record(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RecordTransferBodyDto) {
    try {
      const outcome = await this.transfers.record(actor, body);

      return await this.query.recordedOf(outcome.transfer, outcome.warnings);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Get()
  @ApiOperation({ operationId: 'departmentTransferList', summary: 'List transfers of people' })
  @ApiSuccessResponse(TransferPageResponseDto, {
    message: 'DEPARTMENT_TRANSFER.LISTED',
    description:
      'A page of transfers, the latest day first, optionally of one person, one state or a range of days. Each row says who, what changes, from where to where, the day and where it stands; the basis and the head handover are in the detail.',
  })
  @ApiErrorResponses(...COMMON, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'A filter is invalid (VALIDATION_ERROR).',
  })
  async list(@Query() query: ListTransfersQueryDto) {
    try {
      return await this.query.list(query);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'departmentTransferGet', summary: 'Read a transfer in full' })
  @ApiSuccessResponse(TransferDetailResponseDto, {
    message: 'DEPARTMENT_TRANSFER.RETRIEVED',
    description:
      'The transfer with its basis, who follows the head of the old department, who recorded it and how it ended.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not valid (VALIDATION_ERROR).',
  })
  async get(@Param() params: TransferIdParamDto) {
    try {
      return await this.query.get(params.id);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Get(':id/changes')
  @ApiOperation({ operationId: 'departmentTransferChangeList', summary: 'List the moves of a transfer' })
  @ApiSuccessResponse(TransferChangePageResponseDto, {
    message: 'DEPARTMENT_TRANSFER.CHANGES_LISTED',
    description:
      'A page of the moves of the day and the cancellation of the transfer, oldest first, each with its reason and basis.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or a page parameter is not valid (VALIDATION_ERROR).',
  })
  async listChanges(@Param() params: TransferIdParamDto, @Query() query: ListTransferChangesQueryDto) {
    try {
      return await this.query.listChanges(params.id, query);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Post(':id/rescheduling')
  @ApiOperation({ operationId: 'departmentTransferReschedule', summary: 'Move the day of a waiting transfer' })
  @ApiSuccessResponse(TransferDetailResponseDto, {
    message: 'DEPARTMENT_TRANSFER.RESCHEDULED',
    description:
      'The day of the transfer moved: the placement the person has now lasts to the day before the new one, and the handover of the head moved with it. A reason and a basis are required, and only a transfer that has not taken effect can move.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The transfer has taken effect (DEPARTMENT_TRANSFER.ALREADY_EFFECTIVE) or was cancelled (ALREADY_CANCELLED), or an IT Admin moves it for themselves while another can (SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), no reason is given (DEPARTMENT_TRANSFER.REASON_REQUIRED), ${GROUNDS_REFUSALS}, the day is the same, in the past or not after the current placement (NO_CHANGE, EFFECTIVE_DATE_IN_PAST, EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD), or the head of the department cannot be handed over on the new day (HEAD_SUCCESSOR_REQUIRED, SUCCESSOR_NOT_A_MEMBER_ON_DATE): nothing is saved.`,
    },
  )
  async reschedule(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TransferIdParamDto,
    @Body() body: RescheduleTransferBodyDto,
  ) {
    try {
      const record = await this.changes.reschedule(actor, params.id, { ...body, reason: body.reason ?? '' });

      return await this.query.detailOf(record);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Post(':id/cancellation')
  @ApiOperation({ operationId: 'departmentTransferCancel', summary: 'Cancel a waiting transfer' })
  @ApiSuccessResponse(TransferDetailResponseDto, {
    message: 'DEPARTMENT_TRANSFER.CANCELLED',
    description:
      'The transfer was cancelled: the person keeps the department and the title, and the head of the department stays head. A reason and a basis are required, and only a transfer that has not taken effect can be cancelled.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The transfer has taken effect (DEPARTMENT_TRANSFER.ALREADY_EFFECTIVE) or was cancelled already (ALREADY_CANCELLED), or an IT Admin cancels it for themselves while another can (SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), no reason is given (DEPARTMENT_TRANSFER.REASON_REQUIRED), or ${GROUNDS_REFUSALS}.`,
    },
  )
  async cancel(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TransferIdParamDto,
    @Body() body: CancelTransferBodyDto,
  ) {
    try {
      const record = await this.changes.cancel(actor, params.id, { ...body, reason: body.reason ?? '' });

      return await this.query.detailOf(record);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Post(':id/closure')
  @ApiOperation({ operationId: 'departmentTransferClose', summary: 'Close a transfer that has taken effect' })
  @ApiSuccessResponse(TransferDetailResponseDto, {
    message: 'DEPARTMENT_TRANSFER.CLOSED',
    description:
      'The transfer is closed: the people who answer for the service accounts of the person are named, so none of them waits on the person any more. Recording a transfer and its taking effect never wait for this; only the closing does.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The transfer cannot be closed yet (DEPARTMENT_TRANSFER.NOT_CLOSEABLE: details.blockers lists NOT_EFFECTIVE while it waits, or SERVICE_ACCOUNT_UNASSIGNED while a service account still has the person responsible), or it was closed already (ALREADY_CLOSED) or cancelled (ALREADY_CANCELLED). Nothing changes.',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is not valid (VALIDATION_ERROR).' },
  )
  async close(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TransferIdParamDto) {
    try {
      return await this.query.detailOf(await this.closures.close(actor, params.id));
    } catch (error) {
      throw toTransferApiException(error);
    }
  }
}
